
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

            // TODO: Improve subscription management by building subscriptions based on
            //       returned data instead of when connecting. Keep the subscribe logic
            //       that based on declarations walks the in-process requirements so we can
            //       eagerly init data connections without initiationg a data fetch
            //       which may only arrive some time later.
            // TODO: Use 'ccjson.function.tree' to invoke callbaks in a JSON tree after operating
            //       on each node. When porting logic below, ensure following properties are maintained:
            //         * Be able to switch out any object at the subscription boundary to empower dynamic dev
            //           i.e. the IDE can inject axtra subscriptions to manipulate the data flow at runtime
            //           which then gets persisted to the subscription ccjson.function.tree JSON declaration
            //           when saving the new data logic.
        	var subscriptions = {};


            var sortBy = null;
        	self.sortBy = function (field, direction) {
        	    sortBy = {
        	        field: field,
        	        direction: direction
        	    };
        	}
        	self.getSortBy = function () {
        	    return sortBy;
        	}

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
        				
        				var foreignCollectionConsumers = {};
						function getConsumer (collectionName) {
							if (!iterator) return null;
							if (foreignCollectionConsumers[collectionName]) return foreignCollectionConsumers[collectionName];
							foreignCollectionConsumers[collectionName] = new Consumer(rootCollections, {
								pointerPrefix: collectionName + "/"
							});
							foreignCollectionConsumers[collectionName].mapData(iterator(foreignCollectionConsumers[collectionName]));
                            return foreignCollectionConsumers[collectionName];							
						}

        				pointerParts.forEach(function (pointerSegment, i) {
        
        					var dictionaryForSegment = dictionary;
        
        					var lastSegment = (i === pointerParts.length -1);

        					function getLinksToForModel (Model) {
        						var linksTo = (
        							Model &&
        							Model[pointerSegment] &&
        							Model[pointerSegment].linksToOne
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

        						subscriptions.push({
        							_name: "linkToForeign",
        							// These properties in this structure may update whenever getter chain executes							
        							dictionary: dictionaryForSegment,
        							query: pointerSegment,
        							getNotifyNamespace: function () {
        							    return dictionaryForSegment.name + "/" + pointerSegment;
        							},
        							get: function () {
        
        								var value = this.dictionary.get(this.query);
    
                                        var consumer = null;
        
        								if (Array.isArray(value) && value.length > 0) {
        									// NOTE: We assume all records use the same model from the same collection!
        									consumer = getConsumer(value[0].collection.Collection.name);
        								}
        
        								return {
        									query: value,
        									consumer: consumer
        								};
        							}
        						});
        
        						subscriptions.push({
        							_name: "linkToGet",
        							dictionary: linksTo.dictionary,
        							query: null,	// Set by prior subscription.
        							getNotifyNamespace: function () {
        							    return dictionaryForSegment.name;
        							},
        							get: function () {
        							    var self = this;

        								if (Array.isArray(this.query) && this.query.length > 0) {
        
        									var records = this.query.map(function (record) {
        										return self.consumer.getData(record);
        									});
        
        									return {
        										dictionary: records
        									};
        								}
        								if (typeof this.dictionary.get !== "function") {
        								    console.warn("Dictionary '" + this.dictionary.toString() + "' does not implement method 'get()'");
        								    return {};
        									//throw new Error("Dictionary '" + this.dictionary.toString() + "' does not implement method 'get()'");
        								}

                                        // TODO: Do this based on schema.
                                        var id = parseInt(this.query);
        								return {
        									dictionary: this.dictionary.get(id)
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

                                function replaceQueryArgs (value, query) {
                                    if (!query || !value) return value;
									for (var name in query) {
										// TODO: Replace multiple occurences.
										value = value.replace("{" + name + "}", query[name]);
									}
									return value;
                                }

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
            							getNotifyNamespace: function () {
            							    return dictionaryForSegment.name + "/" + pointerSegment;
            							},
        								get: function () {
        								    var self = this;
        
        									var whereInstance = JSON.stringify(where);
											whereInstance = replaceQueryArgs(whereInstance, this.queryArgs);
        									whereInstance = JSON.parse(whereInstance);
        									Object.keys(whereInstance).forEach(function (name) {
        									    if (whereInstance[name] === "*") {
        									        delete whereInstance[name];
        									    } else
        									    // HACK: Fields should be converted based on type.
        									    if (name === "id") {
        									        whereInstance[name] = parseInt(whereInstance[name]);
        									    } else
        									    if (typeof whereInstance[name] === "string") {
            									    if (self.dictionary.Record["@fields"][name].type === "boolean") {
            									        whereInstance[name] = (
            									            whereInstance[name] === "true" ||
            									            whereInstance[name] === "1"
            									        );
            									    }
        									    }
        									});
//console.log("this.dictionary", this.dictionary.Record["@fields"]);

        //console.log("WHERE", where);
        //console.log("WHERE queryArgs", this.queryArgs);
        //console.log("this.dictionary", Object.keys(this.dictionary.store._byId));
//console.log("WHERE", whereInstance);
        
                                            if (consumer) {
                                                var sortBy = consumer.getSortBy();
                                                if (sortBy) {
                                                    this.dictionary.store.comparator = function (a, b) {
                                                        var av = a.get(sortBy.field);
                                                        var bv = b.get(sortBy.field);
                                                        if (av === bv) {
                                                            return 0;
                                                        }
                                                        if (sortBy.direction === "asc") {
                                                            if (av > bv) {
                                                                return 1;
                                                            }
                                                            return -1;
                                                        } else {
                                                            if (av < bv) {
                                                                return 1;
                                                            }
                                                            return -1;
                                                        }
                                                    }
                                                    this.dictionary.store.sort();
                                                }
                                            }

        									var records = this.dictionary.where(whereInstance);
        									if (consumer) {
        										records = records.map(function (record) {
        										    var fields = consumer.getData(record);
        											return {
        											    get: function (name) {
        											        if (name === "*") {
        											            return fields;
        											        }
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
            							getNotifyNamespace: function () {
            							    return dictionaryForSegment.name + "/" + pointerSegment;
            							},
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
            							getNotifyNamespace: function () {
            							    return dictionaryForSegment.name + "/" + pointerSegment;
            							},
        								get: function () {
        									if (typeof this.dictionary.get !== "function") {
            								    console.warn("Dictionary '" + this.dictionary.toString() + "' does not implement method 'get()'");
            								    return {};
            									//throw new Error("Dictionary '" + this.dictionary.toString() + "' does not implement method 'get()'");
        									}

        									// TODO: Warn if field does not exist!
											var query = replaceQueryArgs(this.query, this.queryArgs);
        									return {
        										dictionary: this.dictionary.get(query)
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
        							if (typeof result.consumer !== "undefined") {
        								subscription.consumer = result.consumer;
        							}
        						}

        						subscription.queryArgs = queryArgs;

//console.log("CALL SUBSCRIPTION", subscription);

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


        			var notificationListeners = {};
        			subscriptions.forEach(function (subscription) {
        			    var notifyNamespace = subscription.getNotifyNamespace();
        			    if (!notifyNamespace) return;

    			        // TODO: Add more finer grained change event notifications if field specified.
                        // 'collection/*'
                        // 'collection/<field>'
        			    var m = notifyNamespace.match(/^([^\/]+)\/([^\/]+)$/);
        			    if (m) {
        			        notificationListeners["change:" + m[1]] = true;
        			    } else
        			    // 'collection'
        			    if ( (m = notifyNamespace.match(/^([^\/]+)$/)) ) {
        			        notificationListeners["change:" + m[1]] = true;
        			    } else
                        // 'collection/<localField>/<remoteField>'
        			    if ( (notifyNamespace.match(/^([^\/]+)\/.+$/)) ) {
        			        // TODO: Add notifier for remote field.
        			        notificationListeners["change:" + m[1]] = true;
        			    } else {
                            throw new Error("TODO: Add parser for notify namsepace pattern '" + notifyNamespace + "'");        			        
        			    }
        			});
        			Object.keys(notificationListeners).forEach(function (parts) {
//console.log("-- DATA NOTIFY LISTENER --", parts);        			    
        			    parts = parts.split(":");
        			    var collection = context.getCollection(parts[1]);
        			    if (!collection) {
        			        throw new Error("Collection for name '" + parts[1] + "' not found!");
        			    }
                        attachListener(collection, parts[0], function (event) {
                            // TODO: Verify that data has in fact changed (based on last fetched data)
                            //       and do not fire event if not changed.
//console.log("NOTIFY: mapper collection changed", parts[1], event);
                            self.emit("changed", event);
                        });
        			});


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
        		
        		if (
        		    dataMap["@load"] &&
        		    Array.isArray(dataMap["@load"])
        		) {
        		    var load = {};
        		    dataMap["@load"].forEach(function (pointer) {
        		        load[pointer] = function (query) {
        		            // Force loading no matter what the query is.
        		            return query;
        		        }
        		    });
        		    dataMap["@load"] = load;
        		}

                return self.triggerLoadFromServer();
        	}


        	self.shouldLoadPointerForQuery = function (pointer, query) {
        	    return dataMap["@load"][pointer](LIB._.clone(query));
        	}
        	

            var sourceBaseUrl = null;

            self.setSourceBaseUrl = function (url) {
                sourceBaseUrl = url;
            }

            var pointerLoadPromises = {};
            var lastLoadQuery = "{}";

        	self.triggerLoadFromServer = function () {
        		if (!dataMap["@load"]) {
        		    return LIB.Promise.resolve();
        		}
        		
                var query = self.getQuery() || {};

                var pointers = {};
                Object.keys(dataMap["@load"]).forEach(function (pointer) {
                    var pointerQuery = self.shouldLoadPointerForQuery(pointer, query);
                    if (pointerQuery) {
                        pointers[pointer] = pointerQuery;
                    } else {
                        pointerLoadPromises[pointer] = LIB.Promise.resolve();
                    }
                });
                if (Object.keys(pointers).length === 0) {
        		    return LIB.Promise.resolve();
                }
		        self.emit("loading");
    		    return LIB.Promise.all(Object.keys(pointers).map(function (pointer) {
    		        return self.loadDataSet(pointer, pointers[pointer]);
    		    })).then(function () {
    		        self.emit("loaded");
    		    });
        	}

        	self.loadDataSet = function (pointer, query) {

                // If any query parameter is `null` or `undefined` we DO NOT use that parameter!
                Object.keys(query).forEach(function (name) {
                    if (
                        query[name] === null ||
                        typeof query[name] === "undefined"
                    ) {
                        delete query[name];
                    }
                });

                lastLoadQuery = LIB.CJSON.stringify(query);

		        self.emit("loading", pointer, query);

                var url = LIB.urijs(sourceBaseUrl + "/" + pointer).query(query).toString();

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
                            if (data[collectionName].length > 0) {
                    			collection.store.add(data[collectionName], {
                    			    merge: true
                    			});
                            }
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

        	self.ensureLoaded = function () {
                if (!dataMap["@load"]) {
                    return LIB.Promise.resolve();
                }
                return LIB.Promise.all(Object.keys(dataMap["@load"]).map(function (dataSetName) {
    		        return pointerLoadPromises[dataSetName];
    		    }));
        	}

        	self.getQuery = function () {
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
                return query;
        	}

        	self.getData = function (dictionary) {
        		if (!dataMap) {
        			throw new Error("Data has not yet been mapped!");
        		}
        		var query = self.getQuery();

        	    // We only get the data if the first declared (authorative) data set is loadable.
        	    if (dataMap["@load"] && !self.shouldLoadPointerForQuery(Object.keys(dataMap["@load"]).shift(), query)) {
                    return {};
        	    }

        		// If the query has changed we also trigger a load.
        		if (lastLoadQuery !== LIB.CJSON.stringify(query)) {
//console.log("trigger load because query has changed from", lastLoadQuery, " to ", LIB.CJSON.stringify(query));
                    // NOTE: We do NOT wait for the load to complete. When the data comes in
                    //       we will be called again.
                    self.triggerLoadFromServer().catch(function (err) {
// TODO: Display error somewhere.
                        console.error("Error laoding data from server:", err.stack);
                    });
        		}
        		
				Object.keys(query).forEach(function (name) {
					if (
					    query[name] === null ||
					    typeof query[name] === "undefined"
					) {
					    query[name] = "*";
					}
				});

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


        // Init initial collection data.
        var initialData = context.getCollectionsInitialData();
        if (initialData) {
            // Insert initial records as each collection is registered.
            context.on("collection:registered", function (collection) {
                if (initialData[collection.name]) {
                    collection.store.add(LIB._.values(initialData[collection.name]), {
        			    merge: true
        			});
                }
            });
        }


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
