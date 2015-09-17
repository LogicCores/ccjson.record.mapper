
exports.forLib = function (LIB) {
    var ccjson = this;

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
                        app: function () {
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
                }

            }
            Entity.prototype.config = defaultConfig;

            return Entity;
        }
    });
}
