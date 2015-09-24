
exports.forLib = function (LIB) {
    var ccjson = this;

    const CONTEXTS = require("../logic.cores/0-server.boot").boot(LIB);
    
    
    // TODO: Use exporter core as declared in 'contexts' below instead of including module directly here
    const BROWSERIFY = require("../../cores/export/for/browserify/0-server.api").forLib(LIB);


    return LIB.Promise.resolve({
        forConfig: function (defaultConfig) {

            var Entity = function (instanceConfig) {
                var self = this;

                var config = {};
                LIB._.merge(config, defaultConfig);
                LIB._.merge(config, instanceConfig);
                config = ccjson.attachDetachedFunctions(config);

                var context = config.context();

                var api = context.adapters["data.mapper"].loadCollectionModelsForPath(config.collectionsPath).then(function (models) {

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

                    var api = {
                        Producer: Producer,
                        models: models
                    };

                    context.setAdapterAPI(api);

                    return api;
                });

                self.AspectInstance = function (aspectConfig) {

                    return api.then(function (api) {

                        return LIB.Promise.resolve({
                            collectionsApiBundleApp: function () {
                                return LIB.Promise.resolve(
                                    ccjson.makeDetachedFunction(
                                        function (req, res, next) {

                                            var bundle = [];
                                            bundle.push('window.waitForLibrary(function (LIB) {');
                                            bundle.push('    LIB.Collections = {');
                                            Object.keys(api.models).forEach(function (modelAlias, i) {
                                                bundle.push('        ' + (i>0?",":"") + '"' + modelAlias + '": require("' + api.models[modelAlias]._modulePath + '").forLib(LIB)');
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
