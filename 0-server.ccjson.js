
exports.forLib = function (LIB) {
    var ccjson = this;

    const CONTEXTS = require("../logic.cores/0-server.boot").boot(LIB);
    
    
    // TODO: Use exporter core as declared in 'contexts' below instead of including module directly here
    const BROWSERIFY = require("../../cores/export/for/browserify/0-server.api").forLib(LIB);


    return LIB.Promise.resolve({
        forConfig: function (defaultConfig) {

            var Entity = function (instanceConfig) {
                var self = this;

                self.AspectInstance = function (aspectConfig) {

                    var config = {};
                    LIB._.merge(config, defaultConfig);
                    LIB._.merge(config, instanceConfig);
                    LIB._.merge(config, aspectConfig);
                    config = ccjson.attachDetachedFunctions(config);


                    var contexts = new CONTEXTS.adapters.context.server.Context({
                        "data": {
                            "config": {},
                            "adapters": {
                                "mapper": "ccjson.record.mapper"
                            }
                        },
                        "time": {
                            "adapters": {
                                "moment": "moment"
                            }
                        }
                    });
                    return contexts.adapters.data.mapper.loadCollectionModelsForPath(config.collectionsPath).then(function (models) {


                        var Producer = function () {
                            var self = this;
                            
                            var context = null;
                            var producer = null;
    
                            self.setDataContext = function (_context) {
                                context = _context;
                            }
                            self.setDataProducer = function (_producer) {
                                producer = _producer;
                            }
    
                            self.app = function (options) {
                                return function (req, res, next) {
                                    return LIB.Promise.try(function () {
                                        return producer(
                                            options.context,
                                            options.pointer
                                        );
                                    }).then(function (result) {
                                        res.writeHead(200, {
                                            "Content-Type": "application/json"
                                        });
                                        res.end(JSON.stringify(result, null, 4));
                                        return;
                                    }).catch(next);
                                };
                            }
                        }
    
    
                        var context = {
                            Producer: Producer
                        };
    
                        return LIB.Promise.resolve({
                            collectionsApiBundleApp: function () {
                                return LIB.Promise.resolve(
                                    ccjson.makeDetachedFunction(
                                        function (req, res, next) {

                                            var bundle = [];
                                            bundle.push('window.waitForLibrary(function (LIB) {');
                                            bundle.push('    LIB.Collections = {');
                                            Object.keys(models).forEach(function (modelAlias, i) {
                                                bundle.push('        ' + (i>0?",":"") + '"' + modelAlias + '": require("' + models[modelAlias]._modulePath + '").forLib(LIB)');
                                            });
                                            bundle.push('    };');
                                            bundle.push('});');
    
                                            var apiBundleFile = LIB.path.join(config.collectionsDistPath, "ccjson.record.mapper.js");
                                            return LIB.fs.outputFile(apiBundleFile, bundle.join("\n"), "utf8", function (err) {
                                                if (err) return next(err);

                        						return BROWSERIFY.bundleFiles(
                        							LIB.path.dirname(apiBundleFile),
                        							[
                        								LIB.path.basename(apiBundleFile)
                        							],
                        							LIB.path.join(apiBundleFile, "..", "ccjson.record.mapper.dist.js")
                        						).then(function (bundle) {
                        							res.writeHead(200, {
                        								"Content-Type": "application/javascript"
                        							});
                        							return res.end(bundle);
                        						}).catch(next);
                                            });
                                        }
                                    )
                                );
                            },
                            attachToRequestApp: function () {
                                return LIB.Promise.resolve(
                                    ccjson.makeDetachedFunction(
                                        function (req, res, next) {
                                            if (
                                                config.request &&
                                                config.request.contextAlias
                                            ) {
                                                if (!req.context) {
                                                    req.context = {};
                                                }
                                                req.context[config.request.contextAlias] = context;
                                            }
                                            return next();
                                        }
                                    )
                                );
                            }
                        });
                    });
                }

            }
            Entity.prototype.config = defaultConfig;

            return Entity;
        }
    });
}
