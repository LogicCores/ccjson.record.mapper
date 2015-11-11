
exports.forLib = function (LIB) {

    var exports = {};

    exports.spin = function (context) {

        var Collection = exports.Collection = function (config) {
            var collection = this;

            collection._modulePrefix = config._modulePrefix;
            collection._moduleLoaderPath = config._moduleLoaderPath;
            collection._moduleConfig = config._moduleConfig;
            collection._modulePath = config._modulePath;

            collection["#contracts"] = config["#contracts"] || {};

            // If there are no record keys with '@' prefix we assume we got fields
            if (Object.keys(config.record).filter(function (key) {
                return /^@/.test(key);
            }).length === 0) {
    			config.record = {
    				"@fields": config.record
    			};
    		}

    		// Complete fields
    		if (config.record["@fields"]) {
    		    for (var name in config.record["@fields"]) {
    		        if (!config.record["@fields"][name].type) {
    		            config.record["@fields"][name].type = "string";
    		        }
    		    }
    		}


    		collection.name = config.name;

            // TODO: Make this also configurable using 'context'
            collection.sourceUrl = config.sourceUrl || ("/api/" + config.name);

            
            function makeRecordPrototype () {
                var recordPrototype = {

        			// TODO: Make configurable
          			idAttribute: "id",

          			getAll: function (extraFields) {
          				var self = this;
          				var record = {};
          				Object.keys(config.record["@fields"]).forEach(function (name) {
          					record[name] = self.get(name);
          				});
          				if (extraFields) {
          					for (var name in extraFields) {
        	  					record[name] = self.get(extraFields[name]);
          					}
          				}
          				return record;
          			},
        			get: function (name) {
        				var recordSelf = this;

        				var nameParts = name.split("/");
        				var name = nameParts.shift();

        				function getValueForField () {
        					if (
        						config.record["@fields"] &&
        						config.record["@fields"][name] &&
        						typeof config.record["@fields"][name].derived === "function"
        					) {
        						var attrs = Object.create(recordSelf.attributes);
        						attrs.get = function (name) {
        							return recordSelf.get(name);
        						}
// TODO: If 'typeof context.record[name].connect === "function"' setup consumer and pass along so derived function can register further data connects.
        						return config.record["@fields"][name].derived.call(attrs);
        					}

        					return LIB.backbone.Model.prototype.get.call(recordSelf, name);
        				}

        				if (
        					nameParts.length > 0 &&
        					config.record["@fields"] &&
        					config.record["@fields"][name] &&
        					config.record["@fields"][name].linksToOne
        				) {
        					var value = getValueForField();
        					return context.contexts.adapters.data["ccjson.record.mapper"].get(config.record["@fields"][name].linksToOne + "/" + value + "/" + nameParts.join("/"));
        
        				} else {
        
        					return getValueForField();
        				}				
        			}
        		};

        		if (config.record["@methods"]) {
        			for (var name in config.record["@methods"]) {
        				recordPrototype[name] = config.record["@methods"][name];
        			}
        		}
        		
        		return recordPrototype;
            }

    		collection.Record = LIB.backbone.Model.extend(makeRecordPrototype());
    		collection.Record["@fields"] = config.record["@fields"];


    		collection.Store = LIB.backbone.Collection.extend({
    
    			url: collection.sourceUrl,
    
    			model: collection.Record,
    
    			parse: function (data) {

console.log("PARSE DATA in collection", data);

    				return data.data.map(function (record) {
    					return LIB._.assign(record.attributes, {
    						id: record.id
    					});
    				});
    			}
    		});

    		collection.store = new collection.Store();

    		if (config.store) {
    			Object.keys(config.store).forEach(function (name) {				
    				collection.store[name] = function () {
    					var args = Array.prototype.slice.call(arguments);
    					// Call 'context.store' registered methods in the scope of the 'store'.
    					return config.store[name].apply(collection.store, args);
    				};
    			});
    		}

    		collection.getModel = function (modelAlias) {
    		    // TODO: Map model aliases to implementations/instances using ccjson
    		    var adapter = context.contexts.adapters[modelAlias];
    		    // TODO: Use standard API to fetch model
    		    return adapter.models[collection.name];
    		};

    	    function emitDebounced (event, payload) {
    	    	if (!emitDebounced._actor) {
    	    		emitDebounced._actor = {};
    	    	}
    	    	if (!emitDebounced._actor[event]) {
    	    		emitDebounced._actor[event] = LIB._.debounce(function () {
    	    		    // The latest payload emitted gets used.
    	    			collection.emit(event, emitDebounced._actor[event].payload);
    	    		}, 10);
    	    	}
    	    	emitDebounced._actor[event].payload = payload;
    	    	emitDebounced._actor[event]();
    	    }

    		// Fires when anything has changed.
    		collection.store.on("change", function () {
//console.log("NOTIFY: collection change", collection.name);
    			emitDebounced("change", {
    			    time: Date.now()
    			});
    		});
    		collection.store.on("sync", function () {
//console.log("NOTIFY: collection sync", collection.name);
    			emitDebounced("change", {
    			    time: Date.now()
    			});
    		});
    		collection.store.on("update", function () {
//console.log("NOTIFY: collection update", collection.name);
    			emitDebounced("change", {
    			    time: Date.now()
    			});
    		});
    		collection.store.on("remove", function () {
//console.log("NOTIFY: collection remove", collection.name);
    			emitDebounced("change", {
    			    time: Date.now()
    			});
    		});


        	if (config.collection) {
        		Object.keys(config.collection).forEach(function (name) {
        			collection[name] = function () {
        				var args = Array.prototype.slice.call(arguments);
        				// Call 'context.collection' registered methods in the scope of the 'collection'.
        				return config.collection[name].apply(collection, args);
        			};
        		});
        	}

            context.registerCollection(config.name, collection);
            
            collection.setMaxListeners(50);
        }
        Collection.prototype = Object.create(LIB.EventEmitter.prototype);

    	Collection.prototype.add = function (record) {
    		return this.store.add(record);
    	}
    	Collection.prototype.get = function (id, options) {
    	    var collection = this;
    	    options = options || {};
/*
    	    if (options.ensure === true) {
    	        return new LIB.Promise(function (resolve, reject) {
    	            try {
    	                function check () {
            	            var record = collection.store.get(id);
            	            if (record) return resolve(record);
            	            collection.once("change", function (name) {
            	                return check();
            	            });
    	                }
    	                check();
    	            } catch (err) {
    	                return reject(err);
    	            }
    	        });
    	    }
*/
    		return collection.store.get(id);
    	}
    	Collection.prototype.where = function (query) {

            // We need to convert some string query values to integers or they
            // will not match anything.
            // TODO: Do this more deterministically. i.e. field type in DB and client model and query should match.
    	    var concreteQuery = {};
    	    for (var name in query) {
/*
    	        if (this.Record["@fields"][name].linksToOne) {
    	            concreteQuery[name] = parseInt(query[name] || "0");
    	            if (concreteQuery[name] === 0) {
    	                delete concreteQuery[name];
    	            }
    	        } else {
*/
    	            concreteQuery[name] = query[name];
//    	        }
    	    }
//console.log("concreteQuery", concreteQuery);

    		return this.store.where(concreteQuery);
    	}



        var Seed = exports.Seed = function (config) {
            var seed = this;

            seed["#contracts"] = config["#contracts"] || {};
    		seed.name = config.name;
    		seed.records = config.records;
        }

        return {
            Collection: Collection,
            Seed: Seed
        };
    }

    return exports;
}

