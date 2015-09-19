
exports.forLib = function (LIB) {

    var exports = {};

    exports.spin = function (context) {

        var moment = context.contexts.adapters.time.moment.moment;

        var Collections = function () {
        	var self = this;
        	self.get = function (id) {
        		return context.getCollection(id);
        	}
        }
        
        var collections = new Collections();
    

        var Consumer = exports.Consumer = function (rootCollections, rootCollectionsOptions) {
        	var self = this;
        
        	rootCollections = rootCollections || collections;
        	rootCollectionsOptions = rootCollectionsOptions || {};
        
        	var listeners = [];
        
        
        	function attachListener (target, event, handler) {
        		target.on(event, handler);
        		listeners.push({
        			destroy: function () {
        				target.off(event, handler);
        			}
        		});
        	}

        	var connections = {};
        	var subscriptions = {};

        	self.connect = function (pointer, options, iterator) {

        		if (typeof iterator === "undefined" && typeof options === "function") {
        			iterator = options;
        			options = null;
        		}
        
        		options = options || {};

        		if (rootCollectionsOptions.pointerPrefix) {
        			pointer = rootCollectionsOptions.pointerPrefix + pointer;
        		}
        
        		try {
        
        			// 'page/loaded/selectedEvent/day_id'
        			// 'page/loaded/selectedEvent/consumer_group_id/deliverLocation'
        			// 'cart/itemCount()'
        			// 'days/*'
        
        			function buildSubscriptions (dictionary, pointerParts) {
        				// A 'dictionary' is a collection or a record
        
        				var subscriptions = [];
        
        				var pointerSegment = null;
        
        				pointerParts.forEach(function (pointerSegment, i) {
        
        					var dictionaryForSegment = dictionary;
        
        					var lastSegment = (i === pointerParts.length -1);
        
        					function getLinksToForModel (Model) {
        						var linksTo = (
        							Model &&
        							Model[pointerSegment] &&
        							Model[pointerSegment].linksTo
        						) || null;
        						if (!linksTo) return null;
        						var foreignDictionary = rootCollections.get(linksTo);
        						if (!foreignDictionary) {
        							throw new Error("Dictionary '" + linksTo + "' declared for '" + pointerSegment + "' not found!");
        						}
        						return {
        							name: linksTo,
        							dictionary: foreignDictionary
        						};
        					}

        					var linksTo = getLinksToForModel(dictionaryForSegment.Record["@fields"]);

        					if (linksTo) {
        						// Our dictionary holds a value that is a key in a foreign dictionary.
        						// We continue resolving the pointer using this foreign dictionary.
        
        
        						var consumer = null
        						function getConsumer (collectionName) {
        							if (!iterator) return null;
        							if (consumer) return consumer;
        							consumer = new Consumer(rootCollections, {
        								pointerPrefix: collectionName + "/"
        							});
        							consumer.mapData(iterator(consumer));
        						}
        
        
        						subscriptions.push({
        							_name: "linkToForeign",
        							// These properties in this structure may update whenever getter chain executes							
        							dictionary: dictionaryForSegment,
        							query: pointerSegment,
        
        							get: function () {
        
        								var value = this.dictionary.get(this.query);
        
        								if (Array.isArray(value) && value.length > 0) {
        									// NOTE: We assume all records use the same model from the same collection!
        									getConsumer(value[0].collection.Collection.name);
        								}
        
        								return {
        									query: value
        								};
        							}
        						});
        
        						subscriptions.push({
        							_name: "linkToGet",
        							dictionary: linksTo.dictionary,
        							query: null,	// Set by prior subscription.
        							get: function () {

        								if (Array.isArray(this.query) && this.query.length > 0) {
        
        									var records = this.query.map(function (record) {
        										return consumer.getData(record);
        									});
        
        									return {
        										dictionary: records
        									};
        								}
        
        
        								if (typeof this.dictionary.get !== "function") {
        									throw new Error("Dictionary '" + this.dictionary.toString() + "' does not implement method 'get()'");
        								}
        
        								return {
        									dictionary: this.dictionary.get(this.query)
        								};
        							}
        						});
        
        
        						dictionary = linksTo.dictionary
        
        					} else {
        						// Our dictionary holds the value.
        
        
        						// We may want to query more than one record with
        						// attribute-based filtering or get everything.
        //console.log("pointerSegment", pointerSegment);						
        						var query = pointerSegment.match(/^(\*)?(\[.+\])?$/);
        //console.log("query", query);						
        						if (query) {
        
        							var consumer = null
        							if (iterator) {
        								consumer = new Consumer(rootCollections, {
        									pointerPrefix: dictionaryForSegment.name + "/"
        								});
        								consumer.mapData(iterator(consumer));
        							}
        
        							var where = {};
        
        							var re = /(\[([^=]+)="([^"]+)"\])/g;
        							var match = null;
        							while (match = re.exec(query[2] || "")) {
        								where[match[2]] = match[3];
        							}
        
        							subscriptions.push({
        								_name: "query",
        								// These properties in this structure may update whenever getter chain executes							
        								dictionary: dictionaryForSegment,
        								query: pointerSegment,
        
        								get: function () {
        
        									var whereInstance = JSON.stringify(where);
        									if (this.queryArgs) {
        										for (var name in this.queryArgs) {
        											// TODO: Replace multiple occurences.
        											whereInstance = whereInstance.replace("{" + name + "}", this.queryArgs[name]);
        										}
        									}
        									whereInstance = JSON.parse(whereInstance);
        									Object.keys(whereInstance).forEach(function (name) {
        									    if (whereInstance[name] === "*") {
        									        delete whereInstance[name];
        									    }
        									});
        //console.log("WHERE", where);
        //console.log("WHERE queryArgs", this.queryArgs);
        //console.log("WHERE", whereInstance);
        
        									var records = this.dictionary.where(whereInstance);
        									if (consumer) {
        										records = records.map(function (record) {
        										    var fields = consumer.getData(record);
        											return {
        											    get: function (name) {
        											        return fields[name];
        											    }
        											};
        										});
        									}
        
        									if (query[1]) {
        										// Prefixed with '*' so we return multiple values
        									} else {
        										// Only return one value
        										if (records.length > 1) {
        											throw new Error("Query '" + pointerSegment + "' from pointer '" + pointer + "' returned more than one result!");
        										}
        
        										records = records.shift();
        									}

        									return {
        										dictionary: records
        									};
        								}
        							});
        
        						} else
        						// We may want to call a function instead of lookup a record by ID.
        						if (/\(\)$/.test(pointerSegment)) {
        
        							subscriptions.push({
        								_name: "method",
        								// These properties in this structure may update whenever getter chain executes							
        								dictionary: dictionaryForSegment,
        								query: pointerSegment,
        
        								get: function () {
        
        									var methodName = this.query.replace(/\(\)$/, "");
        
        									if (typeof this.dictionary[methodName] !== "function") {
        										throw new Error("Collection '" + this.dictionary.toString() + "' does not have method '" + methodName + "'");
        									}
        
        									return {
        										dictionary: this.dictionary[methodName].call(this.dictionary)
        									};
        								}
        							});
        
        						} else {
        
        							subscriptions.push({
        								_name: "get",
        								// These properties in this structure may update whenever getter chain executes							
        								dictionary: dictionaryForSegment,
        								query: pointerSegment,
        
        								get: function () {
        
        									if (typeof this.dictionary.get !== "function") {
        										throw new Error("Dictionary '" + this.dictionary.toString() + "' does not implement method 'get()'");
        									}

        									// TODO: Warn if field does not exist!

        									return {
        										dictionary: this.dictionary.get(this.query)
        									};
        								}
        							});
        
        						}
        					}
        				});
        
        				return subscriptions;
        			}
        
        
        
        			var pointerParts = pointer.split("/");
        
        			var rootCollection = pointerParts.shift();
        
        			var collection = rootCollections.get(rootCollection);
        			if (!collection) {
        				throw new Error("Collection '" + rootCollection + "' not found for pointer '" + pointer + "'!");
        			}
        
        			var subscriptions = buildSubscriptions(collection, pointerParts);
        
        
        			var getter = function (dictionary, queryArgs) {
        				try {
        					var result = null;
        
        //console.log("RESULT FOR", "subscriptions", subscriptions);
        
        					subscriptions.forEach(function (subscription, i) {
        
        						if (i === 0) {
        							// The first subscription has the root dictionary
        							// set correctly or we can override it. We query the subscription chain from here.
        							if (dictionary) {
        								subscription.dictionary = dictionary;
        							}
        						} else {
        							// All other subscriptions get the dictionary set based
        							// on the result of the previous subscription.
        							if (typeof result.dictionary !== "undefined") {
        								subscription.dictionary = result.dictionary;
        							}
        							if (typeof result.query !== "undefined") {
        								subscription.query = result.query;
        							}
        						}
        
        						subscription.queryArgs = queryArgs;
        						result = subscription.get.call(subscription);
        
        //console.log("RESULT FOR", result, i);
        
        					});
        					// 'dictionary' now contains the value at the end of the pointer
        					var value = result.dictionary;
        
        					if (
        						typeof options.ifUndefined !== "undefined" &&
        						typeof value === "undefined"
        					) {
        						value = options.ifUndefined;
        					}
        
        					if (
        						typeof options.ifNot !== "undefined" &&
        						!value
        					) {
        						value = options.ifNot;
        					}
        
        					if (typeof options.prefix !== "undefined") {
        						value = options.prefix + value;
        					}
        
        					if (typeof options.suffix !== "undefined") {
        						value = value + options.suffix;
        					}

        					if (typeof options.format === "function") {
        					    value = options.format(value);
        					} else
        					if (
        					    typeof options.format === "object" &&
        					    typeof options.format.moment === "string"
        					) {
        					    value = moment(value).format(options.format.moment);
        					}

        					return value;
        				} catch (err) {
        					console.error("Error while getting value for pointer '" + pointer + "':", err.stack);
        					throw err;
        				}
        			}
        
        			return getter;
        
        		} catch (err) {
        			console.error("Error while connecting data pointer:", pointer, options, err.stack);
        			throw err;
        		}
        	}
        
        
        
        	var dataMap = null;
        	self.mapData = function (_dataMap) {

                // If there are no record keys with '@' prefix we assume we got a map
                if (Object.keys(_dataMap).filter(function (key) {
                    return /^@/.test(key);
                }).length === 0) {
        			_dataMap = {
        				"@map": _dataMap
        			};
        		}

        		dataMap = _dataMap;

        		if (dataMap["@load"]) {
    		        self.emit("loading");
        		    LIB.Promise.all(dataMap["@load"].map(function (dataSetName) {
        		        return self.loadDataSet(dataSetName);
        		    })).then(function () {
        		        self.emit("loaded");
        		    });
        		}
        	}

            var sourceBaseUrl = null;

            self.setSourceBaseUrl = function (url) {
                sourceBaseUrl = url;
            }
            
            var pointerLoadPromises = {};

        	self.loadDataSet = function (pointer) {

		        self.emit("loading", pointer);

                var url = sourceBaseUrl + "/" + pointer;

                pointerLoadPromises[pointer] = new LIB.Promise(function (resolve, reject) {

                	return context.contexts.adapters.fetch.window.fetch(url).then(function(response) {
        				return response.json();
        			}).then(function (data) {
        			    Object.keys(data).forEach(function (collectionName) {
        			        var collection = context.getCollection(collectionName);
        			        if (!collection) {
        			            // TODO: Optionally just issue warning
        			            throw new Error("Collection with name '" + collectionName + "' needed to store fetched data not found!");
        			        }
                			collection.store.add(data[collectionName], {
                			    merge: true
                			});
        			    });
        			}).then(function () {
        		        self.emit("loaded", pointer);
        		        return resolve();
        			}).catch(reject);
                }).catch(function (err) {
    			    console.error("Error fetching session info from '" + url + "':", err.stack);
    			    throw err;
    			});
        	}
        	
        	self.ensureDepends = function (helpers) {
                if (!dataMap["@depends"]) {
                    return LIB.Promise.resolve();
                }
                if (!dataMap["@depends"]["page.components"]) {
                    return LIB.Promise.resolve();
                }
                return LIB.Promise.all(dataMap["@depends"]["page.components"].map(function (id) {
                    return helpers.getPageComponent(id);
                }));
        	}

        	self.ensureLoaded = function () {
                if (!dataMap["@load"]) {
                    return LIB.Promise.resolve();
                }
                return LIB.Promise.all(dataMap["@load"].map(function (dataSetName) {
    		        return pointerLoadPromises[dataSetName];
    		    }));
        	}

        	self.getData = function (dictionary) {
        		if (!dataMap) {
        			throw new Error("Data has not yet been mapped!");
        		}
        		var query = {};
        		if (dataMap["@query"]) {
        			try {
        				Object.keys(dataMap["@query"]).forEach(function (name) {
        					if (typeof dataMap["@query"][name] !== "function") {
        						console.error('dataMap["@query"][name]', dataMap["@query"], name, dataMap["@query"][name]);
        						throw new Error("Value at '" + name + "' for '@query' is not a function!");
        					}
        					query[name] = dataMap["@query"][name](query);
        				});
        			} catch (err) {
        				console.error("Error during '@query' but ignoring:", err.stack);
        			}
        		}
        		var data = {};
        		Object.keys(dataMap["@map"]).forEach(function (name) {
        			if (typeof dataMap["@map"][name] !== "function") {
        				console.error("dataMap[name]", dataMap["@map"], name, dataMap["@map"][name]);
        				throw new Error("Value at '" + name + "' is not a function! Did you forget a 'linksTo' declaration?");
        			}
        			data[name] = dataMap["@map"][name](dictionary, query);
        		});
        		if (typeof dataMap["@postprocess"] === "function") {
        			try {
        				data = dataMap["@postprocess"](data);
        			} catch (err) {
        				console.error("Error during '@postprocess' but ignoring:", err.stack);
        			}
        		}
        		return data;
        	}

        	self.destroy = function () {

//console.log("RELEASE ALL LISTENERS!");

        		self.removeAllListeners();

        		listeners.forEach(function (listener) {
        			listener.destroy();
        		});
        	}
        }
        Consumer.prototype = Object.create(LIB.EventEmitter.prototype);


        return {
            Consumer: Consumer,
            get: function (pointer) {
            
            	var consumer = new Consumer(collections, {
            		trackChanges: false
            	});
            
            //console.log("pointer", pointer);
            
            	consumer.mapData({
            		"value": consumer.connect(pointer)
            	});
            
            	var data = consumer.getData();
            
            	if (typeof data.value === "undefined") {
            		console.warn("No data at pointer '" + pointer + "'!");
            	}
            
            //console.log("GOT DATA", data, pointer);
            //throw "STOP";
            
            	return data.value;
            }
        };
    }

    return exports;
}
