
exports.forLib = function (LIB) {

    var exports = {};

    exports.spin = function (context) {

        var Collection = exports.Collection = function (config) {
            var collection = this;

            // If there are no record keys with '@' prefix we assume we got fields
            if (Object.keys(config.record).filter(function (key) {
                return /^@/.test(key);
            }).length === 0) {
    			config.record = {
    				"@fields": context.record
    			};
    		}
    		
    		collection.name = config.name;

            // TODO: Make this also configurable using 'context'
            collection.sourceUrl = config.sourceUrl || ("/api/" + config.name);

            
            function makeRecordPrototype () {

                var recordPrototype = {
        			initialize: function () {
        				this._super_ = self.Record.__super__;
        			},

        			// TODO: Make configurable
          			idAttribute: "id",

          			"@fields": config.record["@fields"],

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
        					return recordSelf._super_.get.call(recordSelf, name);
        				}
        
        
        				if (
        					nameParts.length > 0 &&
        					config.record["@fields"] &&
        					config.record["@fields"][name] &&
        					config.record["@fields"][name].linksTo
        				) {
        
        					var value = getValueForField();
        
        					return exports.get(config.record["@fields"][name].linksTo + "/" + value + "/" + nameParts.join("/"));
        
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
            }

    		collection.Record = LIB.backbone.Model.extend(makeRecordPrototype());

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


/*
    	    function emitDebounced (event) {
    	    	if (!emitDebounced._actor) {
    	    		emitDebounced._actor = {};
    	    	}
    	    	if (!emitDebounced._actor[event]) {
    	    		emitDebounced._actor[event] = LIB._.debounce(function () {
    	    			self.emit(event);
    	    		}, 10);
    	    	}
    	    	emitDebounced._actor[event]();
    	    }
    
    
    		// Fires when anything has changed.
    		self.store.on("change", function () {
    			emitDebounced("change");
    		});
    		self.store.on("sync", function () {
    			emitDebounced("change");
    		});
    		self.store.on("update", function () {
    			emitDebounced("change");
    		});
    		self.store.on("remove", function () {
    			emitDebounced("change");
    		});
*/


        	if (config.collection) {
        		Object.keys(config.collection).forEach(function (name) {
        			collection[name] = function () {
        				var args = Array.prototype.slice.call(arguments);
        				// Call 'context.collection' registered methods in the scope of the 'collection'.
        				return config.collection[name].apply(collection, args);
        			};
        		});
        	}

console.log("init collection", collection);


            context.registerCollection(config.name, collection);
        }
        Collection.prototype = Object.create(LIB.EventEmitter.prototype);

    	Collection.prototype.add = function (record) {
    		return this.store.add(record);
    	}
    	Collection.prototype.get = function (id) {
    		return this.store.get(id);
    	}
    	Collection.prototype.where = function (query) {
    		return this.store.where(query);
    	}

        return {
            Collection: Collection
        };
    }

    return exports;
}

