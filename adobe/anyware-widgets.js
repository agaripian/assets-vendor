/**
 * AnywareComponents - 2.38.0-jenkins-AWC_AnywareComponents_master-72 (2015-06-19)
 * Collection of resusable Adobe Anyware Widgets
 * Copyright (c) 2015 Adobe Systems Inc
 */

(function () {/**
 * @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("lib/almond/almond", function(){});

/**
	This Module is used at build time of anyware widgets so that jquery can be excluded
	from the minified file.
**/

define('jquery',[],function(){
	return window.$;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/util/can',[],function () {

    var can = window.can || {};
    if (typeof GLOBALCAN === 'undefined' || GLOBALCAN !== false) {
        window.can = can;
    }

    can.isDeferred = function (obj) {
        var isFunction = this.isFunction;
        // Returns `true` if something looks like a deferred.
        return obj && isFunction(obj.then) && isFunction(obj.pipe);
    };

    var cid = 0;
    can.cid = function (object, name) {
        if (object._cid) {
            return object._cid
        } else {
            return object._cid = (name || "") + (++cid)
        }
    }
    return can;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/util/array/each',['can/util/can'], function (can) {
    can.each = function (elements, callback, context) {
        var i = 0,
            key;
        if (elements) {
            if (typeof elements.length === 'number' && elements.pop) {
                if (elements.attr) {
                    elements.attr('length');
                }
                for (key = elements.length; i < key; i++) {
                    if (callback.call(context || elements[i], elements[i], i, elements) === false) {
                        break;
                    }
                }
            } else if (elements.hasOwnProperty) {
                for (key in elements) {
                    if (elements.hasOwnProperty(key)) {
                        if (callback.call(context || elements[key], elements[key], key, elements) === false) {
                            break;
                        }
                    }
                }
            }
        }
        return elements;
    };

    return can;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/util/jquery',['jquery', 'can/util/can', 'can/util/array/each'], function ($, can) {
    // _jQuery node list._
    $.extend(can, $, {
        trigger: function (obj, event, args) {
            if (obj.trigger) {
                obj.trigger(event, args);
            } else {
                $.event.trigger(event, args, obj, true);
            }
        },
        addEvent: function (ev, cb) {
            $([this]).bind(ev, cb);
            return this;
        },
        removeEvent: function (ev, cb) {
            $([this]).unbind(ev, cb);
            return this;
        },
        // jquery caches fragments, we always needs a new one
        buildFragment: function (elems, context) {
            var oldFragment = $.buildFragment,
                ret;

            elems = [elems];
            // Set context per 1.8 logic
            context = context || document;
            context = !context.nodeType && context[0] || context;
            context = context.ownerDocument || context;

            ret = oldFragment.call(jQuery, elems, context);

            return ret.cacheable ? $.clone(ret.fragment) : ret.fragment || ret;
        },
        $: $,
        each: can.each
    });

    // Wrap binding functions.
    $.each(['bind', 'unbind', 'undelegate', 'delegate'], function (i, func) {
        can[func] = function () {
            var t = this[func] ? this : $([this]);
            t[func].apply(t, arguments);
            return this;
        };
    });

    // Wrap modifier functions.
    $.each(["append", "filter", "addClass", "remove", "data", "get"], function (i, name) {
        can[name] = function (wrapped) {
            return wrapped[name].apply(wrapped, can.makeArray(arguments).slice(1));
        };
    });

    // Memory safe destruction.
    var oldClean = $.cleanData;

    $.cleanData = function (elems) {
        $.each(elems, function (i, elem) {
            if (elem) {
                can.trigger(elem, "destroyed", [], false);
            }
        });
        oldClean(elems);
    };

    return can;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/util/library',['can/util/jquery'], function (can) {
    return can;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/util/string',['can/util/library'], function (can) {
    // ##string.js
    // _Miscellaneous string utility functions._  
    // Several of the methods in this plugin use code adapated from Prototype
    // Prototype JavaScript framework, version 1.6.0.1.
    // © 2005-2007 Sam Stephenson
    var strUndHash = /_|-/,
        strColons = /\=\=/,
        strWords = /([A-Z]+)([A-Z][a-z])/g,
        strLowUp = /([a-z\d])([A-Z])/g,
        strDash = /([a-z\d])([A-Z])/g,
        strReplacer = /\{([^\}]+)\}/g,
        strQuote = /"/g,
        strSingleQuote = /'/g,

        // Returns the `prop` property from `obj`.
        // If `add` is true and `prop` doesn't exist in `obj`, create it as an 
        // empty object.
        getNext = function (obj, prop, add) {
            return prop in obj ? obj[prop] : (add && (obj[prop] = {}));
        },

        // Returns `true` if the object can have properties (no `null`s).
        isContainer = function (current) {
            return (/^f|^o/).test(typeof current);
        };

    can.extend(can, {
        // Escapes strings for HTML.
        esc: function (content) {
            // Convert bad values into empty strings
            var isInvalid = content === null || content === undefined || (isNaN(content) && ("" + content === 'NaN'));
            return ("" + (isInvalid ? '' : content)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(strQuote, '&#34;').replace(strSingleQuote, "&#39;");
        },


        getObject: function (name, roots, add) {

            // The parts of the name we are looking up  
            // `['App','Models','Recipe']`
            var parts = name ? name.split('.') : [],
                length = parts.length,
                current, r = 0,
                ret, i;

            // Make sure roots is an `array`.
            roots = can.isArray(roots) ? roots : [roots || window];

            if (!length) {
                return roots[0];
            }

            // For each root, mark it as current.
            while (roots[r]) {
                current = roots[r];

                // Walk current to the 2nd to last object or until there 
                // is not a container.
                for (i = 0; i < length - 1 && isContainer(current); i++) {
                    current = getNext(current, parts[i], add);
                }

                // If we can get a property from the 2nd to last object...
                if (isContainer(current)) {

                    // Get (and possibly set) the property.
                    ret = getNext(current, parts[i], add);

                    // If there is a value, we exit.
                    if (ret !== undefined) {
                        // If `add` is `false`, delete the property
                        if (add === false) {
                            delete current[parts[i]];
                        }
                        return ret;

                    }
                }
                r++;
            }
        },
        // Capitalizes a string.
        capitalize: function (s, cache) {
            // Used to make newId.
            return s.charAt(0).toUpperCase() + s.slice(1);
        },

        // Underscores a string.
        underscore: function (s) {
            return s.replace(strColons, '/').replace(strWords, '$1_$2').replace(strLowUp, '$1_$2').replace(strDash, '_').toLowerCase();
        },
        // Micro-templating.
        sub: function (str, data, remove) {
            var obs = [];

            obs.push(str.replace(strReplacer, function (whole, inside) {

                // Convert inside to type.
                var ob = can.getObject(inside, data, remove === undefined ? remove : !remove);

                if (ob === undefined) {
                    obs = null;
                    return "";
                }

                // If a container, push into objs (which will return objects found).
                if (isContainer(ob) && obs) {
                    obs.push(ob);
                    return "";
                }

                return "" + ob;
            }));

            return obs === null ? obs : (obs.length <= 1 ? obs[0] : obs);
        },

        // These regex's are used throughout the rest of can, so let's make
        // them available.
        replacer: strReplacer,
        undHash: strUndHash
    });
    return can;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/construct',['can/util/string'], function (can) {

    // ## construct.js
    // `can.Construct`  
    // _This is a modified version of
    // [John Resig's class](http://ejohn.org/blog/simple-javascript-inheritance/).  
    // It provides class level inheritance and callbacks._
    // A private flag used to initialize a new class instance without
    // initializing it's bindings.
    var initializing = 0;


    can.Construct = function () {
        if (arguments.length) {
            return can.Construct.extend.apply(can.Construct, arguments);
        }
    };


    can.extend(can.Construct, {

        newInstance: function () {
            // Get a raw instance object (`init` is not called).
            var inst = this.instance(),
                arg = arguments,
                args;

            // Call `setup` if there is a `setup`
            if (inst.setup) {
                args = inst.setup.apply(inst, arguments);
            }

            // Call `init` if there is an `init`  
            // If `setup` returned `args`, use those as the arguments
            if (inst.init) {
                inst.init.apply(inst, args || arguments);
            }

            return inst;
        },
        // Overwrites an object with methods. Used in the `super` plugin.
        // `newProps` - New properties to add.  
        // `oldProps` - Where the old properties might be (used with `super`).  
        // `addTo` - What we are adding to.
        _inherit: function (newProps, oldProps, addTo) {
            can.extend(addTo || newProps, newProps || {})
        },
        // used for overwriting a single property.
        // this should be used for patching other objects
        // the super plugin overwrites this
        _overwrite: function (what, oldProps, propName, val) {
            what[propName] = val;
        },
        // Set `defaults` as the merger of the parent `defaults` and this 
        // object's `defaults`. If you overwrite this method, make sure to
        // include option merging logic.
        setup: function (base, fullName) {
            this.defaults = can.extend(true, {}, base.defaults, this.defaults);
        },
        // Create's a new `class` instance without initializing by setting the
        // `initializing` flag.
        instance: function () {

            // Prevents running `init`.
            initializing = 1;

            var inst = new this();

            // Allow running `init`.
            initializing = 0;

            return inst;
        },
        // Extends classes.
        extend: function (fullName, klass, proto) {
            // Figure out what was passed and normalize it.
            if (typeof fullName != 'string') {
                proto = klass;
                klass = fullName;
                fullName = null;
            }

            if (!proto) {
                proto = klass;
                klass = null;
            }
            proto = proto || {};

            var _super_class = this,
                _super = this.prototype,
                name, shortName, namespace, prototype;

            // Instantiate a base class (but only create the instance,
            // don't run the init constructor).
            prototype = this.instance();

            // Copy the properties over onto the new prototype.
            can.Construct._inherit(proto, _super, prototype);

            // The dummy class constructor.


            function Constructor() {
                // All construction is actually done in the init method.
                if (!initializing) {
                    return this.constructor !== Constructor && arguments.length ?
                    // We are being called without `new` or we are extending.
                    arguments.callee.extend.apply(arguments.callee, arguments) :
                    // We are being called with `new`.
                    this.constructor.newInstance.apply(this.constructor, arguments);
                }
            }

            // Copy old stuff onto class (can probably be merged w/ inherit)
            for (name in _super_class) {
                if (_super_class.hasOwnProperty(name)) {
                    Constructor[name] = _super_class[name];
                }
            }

            // Copy new static properties on class.
            can.Construct._inherit(klass, _super_class, Constructor);

            // Setup namespaces.
            if (fullName) {

                var parts = fullName.split('.'),
                    shortName = parts.pop(),
                    current = can.getObject(parts.join('.'), window, true),
                    namespace = current,
                    _fullName = can.underscore(fullName.replace(/\./g, "_")),
                    _shortName = can.underscore(shortName);



                current[shortName] = Constructor;
            }

            // Set things that shouldn't be overwritten.
            can.extend(Constructor, {
                constructor: Constructor,
                prototype: prototype,

                namespace: namespace,

                shortName: shortName,
                _shortName: _shortName,

                fullName: fullName,
                _fullName: _fullName
            });

            // Make sure our prototype looks nice.
            Constructor.prototype.constructor = Constructor;


            // Call the class `setup` and `init`
            var t = [_super_class].concat(can.makeArray(arguments)),
                args = Constructor.setup.apply(Constructor, t);

            if (Constructor.init) {
                Constructor.init.apply(Constructor, args || t);
            }


            return Constructor;

        }

    });
    return can.Construct;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/control',['can/util/library', 'can/construct'], function (can) {
    // ## control.js
    // `can.Control`  
    // _Controller_
    // Binds an element, returns a function that unbinds.
    var bind = function (el, ev, callback) {

        can.bind.call(el, ev, callback);

        return function () {
            can.unbind.call(el, ev, callback);
        };
    },
        isFunction = can.isFunction,
        extend = can.extend,
        each = can.each,
        slice = [].slice,
        paramReplacer = /\{([^\}]+)\}/g,
        special = can.getObject("$.event.special", [can]) || {},

        // Binds an element, returns a function that unbinds.
        delegate = function (el, selector, ev, callback) {
            can.delegate.call(el, selector, ev, callback);
            return function () {
                can.undelegate.call(el, selector, ev, callback);
            };
        },

        // Calls bind or unbind depending if there is a selector.
        binder = function (el, ev, callback, selector) {
            return selector ? delegate(el, can.trim(selector), ev, callback) : bind(el, ev, callback);
        },

        basicProcessor;


    var Control = can.Control = can.Construct(

    {
        // Setup pre-processes which methods are event listeners.
        setup: function () {

            // Allow contollers to inherit "defaults" from super-classes as it 
            // done in `can.Construct`
            can.Construct.setup.apply(this, arguments);

            // If you didn't provide a name, or are `control`, don't do anything.
            if (can.Control) {

                // Cache the underscored names.
                var control = this,
                    funcName;

                // Calculate and cache actions.
                control.actions = {};
                for (funcName in control.prototype) {
                    if (control._isAction(funcName)) {
                        control.actions[funcName] = control._action(funcName);
                    }
                }
            }
        },

        // Moves `this` to the first argument, wraps it with `jQuery` if it's an element
        _shifter: function (context, name) {

            var method = typeof name == "string" ? context[name] : name;

            if (!isFunction(method)) {
                method = context[method];
            }

            return function () {
                context.called = name;
                return method.apply(context, [this.nodeName ? can.$(this) : this].concat(slice.call(arguments, 0)));
            };
        },

        // Return `true` if is an action.
        _isAction: function (methodName) {

            var val = this.prototype[methodName],
                type = typeof val;
            // if not the constructor
            return (methodName !== 'constructor') &&
            // and is a function or links to a function
            (type == "function" || (type == "string" && isFunction(this.prototype[val]))) &&
            // and is in special, a processor, or has a funny character
            !! (special[methodName] || processors[methodName] || /[^\w]/.test(methodName));
        },
        // Takes a method name and the options passed to a control
        // and tries to return the data necessary to pass to a processor
        // (something that binds things).
        _action: function (methodName, options) {

            // If we don't have options (a `control` instance), we'll run this 
            // later.  
            paramReplacer.lastIndex = 0;
            if (options || !paramReplacer.test(methodName)) {
                // If we have options, run sub to replace templates `{}` with a
                // value from the options or the window
                var convertedName = options ? can.sub(methodName, [options, window]) : methodName;
                if (!convertedName) {
                    return null;
                }
                // If a `{}` template resolves to an object, `convertedName` will be
                // an array
                var arr = can.isArray(convertedName),

                    // Get the name
                    name = arr ? convertedName[1] : convertedName,

                    // Grab the event off the end
                    parts = name.split(/\s+/g),
                    event = parts.pop();

                return {
                    processor: processors[event] || basicProcessor,
                    parts: [name, parts.join(" "), event],
                    delegate: arr ? convertedName[0] : undefined
                };
            }
        },
        // An object of `{eventName : function}` pairs that Control uses to 
        // hook up events auto-magically.
        processors: {},
        // A object of name-value pairs that act as default values for a 
        // control instance
        defaults: {}
    },

    {
        // Sets `this.element`, saves the control in `data, binds event
        // handlers.
        setup: function (element, options) {

            var cls = this.constructor,
                pluginname = cls.pluginName || cls._fullName,
                arr;

            // Want the raw element here.
            this.element = can.$(element)

            if (pluginname && pluginname !== 'can_control') {
                // Set element and `className` on element.
                this.element.addClass(pluginname);
            }

            (arr = can.data(this.element, "controls")) || can.data(this.element, "controls", arr = []);
            arr.push(this);

            // Option merging.
            this.options = extend({}, cls.defaults, options);

            // Bind all event handlers.
            this.on();

            // Get's passed into `init`.
            return [this.element, this.options];
        },

        on: function (el, selector, eventName, func) {
            if (!el) {

                // Adds bindings.
                this.off();

                // Go through the cached list of actions and use the processor 
                // to bind
                var cls = this.constructor,
                    bindings = this._bindings,
                    actions = cls.actions,
                    element = this.element,
                    destroyCB = can.Control._shifter(this, "destroy"),
                    funcName, ready;

                for (funcName in actions) {
                    // Only push if we have the action and no option is `undefined`
                    if (actions.hasOwnProperty(funcName) && (ready = actions[funcName] || cls._action(funcName, this.options))) {
                        bindings.push(ready.processor(ready.delegate || element, ready.parts[2], ready.parts[1], funcName, this));
                    }
                }


                // Setup to be destroyed...  
                // don't bind because we don't want to remove it.
                can.bind.call(element, "destroyed", destroyCB);
                bindings.push(function (el) {
                    can.unbind.call(el, "destroyed", destroyCB);
                });
                return bindings.length;
            }

            if (typeof el == 'string') {
                func = eventName;
                eventName = selector;
                selector = el;
                el = this.element;
            }

            if (func === undefined) {
                func = eventName;
                eventName = selector;
                selector = null;
            }

            if (typeof func == 'string') {
                func = can.Control._shifter(this, func);
            }

            this._bindings.push(binder(el, eventName, func, selector));

            return this._bindings.length;
        },
        // Unbinds all event handlers on the controller.
        off: function () {
            var el = this.element[0]
            each(this._bindings || [], function (value) {
                value(el);
            });
            // Adds bindings.
            this._bindings = [];
        },
        // Prepares a `control` for garbage collection
        destroy: function () {
            var Class = this.constructor,
                pluginName = Class.pluginName || Class._fullName,
                controls;

            // Unbind bindings.
            this.off();

            if (pluginName && pluginName !== 'can_control') {
                // Remove the `className`.
                this.element.removeClass(pluginName);
            }

            // Remove from `data`.
            controls = can.data(this.element, "controls");
            controls.splice(can.inArray(this, controls), 1);

            can.trigger(this, "destroyed"); // In case we want to know if the `control` is removed.
            this.element = null;
        }
    });

    var processors = can.Control.processors,
        // Processors do the binding.
        // They return a function that unbinds when called.  
        // The basic processor that binds events.
        basicProcessor = function (el, event, selector, methodName, control) {
            return binder(el, event, can.Control._shifter(control, methodName), selector);
        };

    // Set common events to be processed as a `basicProcessor`
    each(["change", "click", "contextmenu", "dblclick", "keydown", "keyup", "keypress", "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "reset", "resize", "scroll", "select", "submit", "focusin", "focusout", "mouseenter", "mouseleave",
    // #104 - Add touch events as default processors
    // TOOD feature detect?
    "touchstart", "touchmove", "touchcancel", "touchend", "touchleave"], function (v) {
        processors[v] = basicProcessor;
    });

    return Control;
});
define('can/control/route',[
	'can/control'
], function(){
	
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/observe',['can/util/library', 'can/construct'], function (can) {
    // ## observe.js  
    // `can.Observe`  
    // _Provides the observable pattern for JavaScript Objects._  
    // Returns `true` if something is an object with properties of its own.
    var canMakeObserve = function (obj) {
        return obj && (can.isArray(obj) || can.isPlainObject(obj) || (obj instanceof can.Observe));
    },

        // Removes all listeners.
        unhookup = function (items, namespace) {
            return can.each(items, function (item) {
                if (item && item.unbind) {
                    item.unbind("change" + namespace);
                }
            });
        },
        // Listens to changes on `val` and "bubbles" the event up.  
        // `val` - The object to listen for changes on.  
        // `prop` - The property name is at on.  
        // `parent` - The parent object of prop.
        // `ob` - (optional) The Observe object constructor
        // `list` - (optional) The observable list constructor
        hookupBubble = function (val, prop, parent, Ob, List) {
            Ob = Ob || Observe;
            List = List || Observe.List;

            // If it's an `array` make a list, otherwise a val.
            if (val instanceof Observe) {
                // We have an `observe` already...
                // Make sure it is not listening to this already
                unhookup([val], parent._cid);
            } else if (can.isArray(val)) {
                val = new List(val);
            } else {
                val = new Ob(val);
            }

            // Listen to all changes and `batchTrigger` upwards.
            val.bind("change" + parent._cid, function () {
                // `batchTrigger` the type on this...
                var args = can.makeArray(arguments),
                    ev = args.shift();
                args[0] = (prop === "*" ? [parent.indexOf(val), args[0]] : [prop, args[0]]).join(".");

                // track objects dispatched on this observe		
                ev.triggeredNS = ev.triggeredNS || {};

                // if it has already been dispatched exit
                if (ev.triggeredNS[parent._cid]) {
                    return;
                }

                ev.triggeredNS[parent._cid] = true;
                // send change event with modified attr to parent	
                can.trigger(parent, ev, args);
                // send modified attr event to parent
                //can.trigger(parent, args[0], args);
            });

            return val;
        },

        // An `id` to track events for a given observe.
        observeId = 0,
        // A helper used to serialize an `Observe` or `Observe.List`.  
        // `observe` - The observable.  
        // `how` - To serialize with `attr` or `serialize`.  
        // `where` - To put properties, in an `{}` or `[]`.
        serialize = function (observe, how, where) {
            // Go through each property.
            observe.each(function (val, name) {
                // If the value is an `object`, and has an `attrs` or `serialize` function.
                where[name] = canMakeObserve(val) && can.isFunction(val[how]) ?
                // Call `attrs` or `serialize` to get the original data back.
                val[how]() :
                // Otherwise return the value.
                val;
            });
            return where;
        },
        $method = function (name) {
            return function () {
                return can[name].apply(this, arguments);
            };
        },
        bind = $method('addEvent'),
        unbind = $method('removeEvent'),
        attrParts = function (attr, keepKey) {
            if (keepKey) {
                return [attr];
            }
            return can.isArray(attr) ? attr : ("" + attr).split(".");
        },
        // Which batch of events this is for -- might not want to send multiple
        // messages on the same batch.  This is mostly for event delegation.
        batchNum = 1,
        // how many times has start been called without a stop
        transactions = 0,
        // an array of events within a transaction
        batchEvents = [],
        stopCallbacks = [];




    var Observe = can.Observe = can.Construct({

        // keep so it can be overwritten
        bind: bind,
        unbind: unbind,
        id: "id",
        canMakeObserve: canMakeObserve,
        // starts collecting events
        // takes a callback for after they are updated
        // how could you hook into after ejs
        startBatch: function (batchStopHandler) {
            transactions++;
            batchStopHandler && stopCallbacks.push(batchStopHandler);
        },

        stopBatch: function (force, callStart) {
            if (force) {
                transactions = 0;
            } else {
                transactions--;
            }

            if (transactions == 0) {
                var items = batchEvents.slice(0),
                    callbacks = stopCallbacks.slice(0);
                batchEvents = [];
                stopCallbacks = [];
                batchNum++;
                callStart && this.startBatch();
                can.each(items, function (args) {
                    can.trigger.apply(can, args);
                });
                can.each(callbacks, function (cb) {
                    cb();
                });
            }
        },

        triggerBatch: function (item, event, args) {
            // Don't send events if initalizing.
            if (!item._init) {
                if (transactions == 0) {
                    return can.trigger(item, event, args);
                } else {
                    event = typeof event === "string" ? {
                        type: event
                    } : event;
                    event.batchNum = batchNum;
                    batchEvents.push([
                    item, event, args]);
                }
            }
        },

        keys: function (observe) {
            var keys = [];
            Observe.__reading && Observe.__reading(observe, '__keys');
            for (var keyName in observe._data) {
                keys.push(keyName);
            }
            return keys;
        }
    },

    {
        setup: function (obj) {
            // `_data` is where we keep the properties.
            this._data = {};

            // The namespace this `object` uses to listen to events.
            can.cid(this, ".observe");
            // Sets all `attrs`.
            this._init = 1;
            this.attr(obj);
            this.bind('change' + this._cid, can.proxy(this._changes, this));
            delete this._init;
        },
        _changes: function (ev, attr, how, newVal, oldVal) {
            Observe.triggerBatch(this, {
                type: attr,
                batchNum: ev.batchNum
            }, [newVal, oldVal]);
        },
        _triggerChange: function (attr, how, newVal, oldVal) {
            Observe.triggerBatch(this, "change", can.makeArray(arguments))
        },

        attr: function (attr, val) {
            // This is super obfuscated for space -- basically, we're checking
            // if the type of the attribute is not a `number` or a `string`.
            var type = typeof attr;
            if (type !== "string" && type !== "number") {
                return this._attrs(attr, val)
            } else if (val === undefined) { // If we are getting a value.
                // Let people know we are reading.
                Observe.__reading && Observe.__reading(this, attr)
                return this._get(attr)
            } else {
                // Otherwise we are setting.
                this._set(attr, val);
                return this;
            }
        },

        each: function () {
            Observe.__reading && Observe.__reading(this, '__keys');
            return can.each.apply(undefined, [this.__get()].concat(can.makeArray(arguments)))
        },

        removeAttr: function (attr) {
            // Info if this is List or not
            var isList = this instanceof can.Observe.List,
                // Convert the `attr` into parts (if nested).
                parts = attrParts(attr),
                // The actual property to remove.
                prop = parts.shift(),
                // The current value.
                current = isList ? this[prop] : this._data[prop];

            // If we have more parts, call `removeAttr` on that part.
            if (parts.length) {
                return current.removeAttr(parts)
            } else {
                if (isList) {
                    this.splice(prop, 1)
                } else if (prop in this._data) {
                    // Otherwise, `delete`.
                    delete this._data[prop];
                    // Create the event.
                    if (!(prop in this.constructor.prototype)) {
                        delete this[prop]
                    }
                    // Let others know the number of keys have changed
                    Observe.triggerBatch(this, "__keys");
                    this._triggerChange(prop, "remove", undefined, current);

                }
                return current;
            }
        },
        // Reads a property from the `object`.
        _get: function (attr) {
            var value = typeof attr === 'string' && !! ~attr.indexOf('.') && this.__get(attr);
            if (value) {
                return value;
            }

            // break up the attr (`"foo.bar"`) into `["foo","bar"]`
            var parts = attrParts(attr),
                // get the value of the first attr name (`"foo"`)
                current = this.__get(parts.shift());
            // if there are other attributes to read
            return parts.length ?
            // and current has a value
            current ?
            // lookup the remaining attrs on current
            current._get(parts) :
            // or if there's no current, return undefined
            undefined :
            // if there are no more parts, return current
            current;
        },
        // Reads a property directly if an `attr` is provided, otherwise
        // returns the "real" data object itself.
        __get: function (attr) {
            return attr ? this._data[attr] : this._data;
        },
        // Sets `attr` prop as value on this object where.
        // `attr` - Is a string of properties or an array  of property values.
        // `value` - The raw value to set.
        _set: function (attr, value, keepKey) {
            // Convert `attr` to attr parts (if it isn't already).
            var parts = attrParts(attr, keepKey),
                // The immediate prop we are setting.
                prop = parts.shift(),
                // The current value.
                current = this.__get(prop);

            // If we have an `object` and remaining parts.
            if (canMakeObserve(current) && parts.length) {
                // That `object` should set it (this might need to call attr).
                current._set(parts, value)
            } else if (!parts.length) {
                // We're in "real" set territory.
                if (this.__convert) {
                    value = this.__convert(prop, value)
                }
                this.__set(prop, value, current)
            } else {
                throw "can.Observe: Object does not exist"
            }
        },
        __set: function (prop, value, current) {

            // Otherwise, we are setting it on this `object`.
            // TODO: Check if value is object and transform
            // are we changing the value.
            if (value !== current) {
                // Check if we are adding this for the first time --
                // if we are, we need to create an `add` event.
                var changeType = this.__get().hasOwnProperty(prop) ? "set" : "add";

                // Set the value on data.
                this.___set(prop,

                // If we are getting an object.
                canMakeObserve(value) ?

                // Hook it up to send event.
                hookupBubble(value, prop, this) :
                // Value is normal.
                value);

                if (changeType == "add") {
                    // If there is no current value, let others know that
                    // the the number of keys have changed
                    Observe.triggerBatch(this, "__keys", undefined);

                }
                // `batchTrigger` the change event.
                this._triggerChange(prop, changeType, value, current);

                //Observe.triggerBatch(this, prop, [value, current]);
                // If we can stop listening to our old value, do it.
                current && unhookup([current], this._cid);
            }

        },
        // Directly sets a property on this `object`.
        ___set: function (prop, val) {
            this._data[prop] = val;
            // Add property directly for easy writing.
            // Check if its on the `prototype` so we don't overwrite methods like `attrs`.
            if (!(prop in this.constructor.prototype)) {
                this[prop] = val
            }
        },


        bind: bind,

        unbind: unbind,

        serialize: function () {
            return serialize(this, 'serialize', {});
        },

        _attrs: function (props, remove) {

            if (props === undefined) {
                return serialize(this, 'attr', {})
            }

            props = can.extend({}, props);
            var prop, self = this,
                newVal;
            Observe.startBatch();
            this.each(function (curVal, prop) {
                newVal = props[prop];

                // If we are merging...
                if (newVal === undefined) {
                    remove && self.removeAttr(prop);
                    return;
                }

                if (self.__convert) {
                    newVal = self.__convert(prop, newVal)
                }

                // if we're dealing with models, want to call _set to let converter run
                if (newVal instanceof can.Observe) {
                    self.__set(prop, newVal, curVal)
                    // if its an object, let attr merge
                } else if (canMakeObserve(curVal) && canMakeObserve(newVal) && curVal.attr) {
                    curVal.attr(newVal, remove)
                    // otherwise just set
                } else if (curVal != newVal) {
                    self.__set(prop, newVal, curVal)
                }

                delete props[prop];
            })
            // Add remaining props.
            for (var prop in props) {
                newVal = props[prop];
                this._set(prop, newVal, true)
            }
            Observe.stopBatch()
            return this;
        },


        compute: function (prop) {
            var self = this,
                computer = function (val) {
                    return self.attr(prop, val);
                };

            return can.compute ? can.compute(computer) : computer;
        }
    });
    // Helpers for `observable` lists.
    var splice = [].splice,
        list = Observe(

        {
            setup: function (instances, options) {
                this.length = 0;
                can.cid(this, ".observe")
                this._init = 1;
                if (can.isDeferred(instances)) {
                    this.replace(instances)
                } else {
                    this.push.apply(this, can.makeArray(instances || []));
                }
                this.bind('change' + this._cid, can.proxy(this._changes, this));
                can.extend(this, options);
                delete this._init;
            },
            _triggerChange: function (attr, how, newVal, oldVal) {

                Observe.prototype._triggerChange.apply(this, arguments)
                // `batchTrigger` direct add and remove events...
                if (!~attr.indexOf('.')) {

                    if (how === 'add') {
                        Observe.triggerBatch(this, how, [newVal, +attr]);
                        Observe.triggerBatch(this, 'length', [this.length]);
                    } else if (how === 'remove') {
                        Observe.triggerBatch(this, how, [oldVal, +attr]);
                        Observe.triggerBatch(this, 'length', [this.length]);
                    } else {
                        Observe.triggerBatch(this, how, [newVal, +attr])
                    }

                }

            },
            __get: function (attr) {
                return attr ? this[attr] : this;
            },
            ___set: function (attr, val) {
                this[attr] = val;
                if (+attr >= this.length) {
                    this.length = (+attr + 1)
                }
            },
            // Returns the serialized form of this list.
            serialize: function () {
                return serialize(this, 'serialize', []);
            },

            splice: function (index, howMany) {
                var args = can.makeArray(arguments),
                    i;

                for (i = 2; i < args.length; i++) {
                    var val = args[i];
                    if (canMakeObserve(val)) {
                        args[i] = hookupBubble(val, "*", this, this.constructor.Observe, this.constructor)
                    }
                }
                if (howMany === undefined) {
                    howMany = args[1] = this.length - index;
                }
                var removed = splice.apply(this, args);
                can.Observe.startBatch();
                if (howMany > 0) {
                    this._triggerChange("" + index, "remove", undefined, removed);
                    unhookup(removed, this._cid);
                }
                if (args.length > 2) {
                    this._triggerChange("" + index, "add", args.slice(2), removed);
                }
                can.Observe.stopBatch();
                return removed;
            },

            _attrs: function (items, remove) {
                if (items === undefined) {
                    return serialize(this, 'attr', []);
                }

                // Create a copy.
                items = can.makeArray(items);

                Observe.startBatch();
                this._updateAttrs(items, remove);
                Observe.stopBatch()
            },

            _updateAttrs: function (items, remove) {
                var len = Math.min(items.length, this.length);

                for (var prop = 0; prop < len; prop++) {
                    var curVal = this[prop],
                        newVal = items[prop];

                    if (canMakeObserve(curVal) && canMakeObserve(newVal)) {
                        curVal.attr(newVal, remove)
                    } else if (curVal != newVal) {
                        this._set(prop, newVal)
                    } else {

                    }
                }
                if (items.length > this.length) {
                    // Add in the remaining props.
                    this.push.apply(this, items.slice(this.length));
                } else if (items.length < this.length && remove) {
                    this.splice(items.length)
                }
            }
        }),

        // Converts to an `array` of arguments.
        getArgs = function (args) {
            return args[0] && can.isArray(args[0]) ? args[0] : can.makeArray(args);
        };
    // Create `push`, `pop`, `shift`, and `unshift`
    can.each({

        push: "length",

        unshift: 0
    },
    // Adds a method
    // `name` - The method name.
    // `where` - Where items in the `array` should be added.


    function (where, name) {
        var orig = [][name]
        list.prototype[name] = function () {
            // Get the items being added.
            var args = [],
                // Where we are going to add items.
                len = where ? this.length : 0,
                i = arguments.length,
                res, val, constructor = this.constructor;

            // Go through and convert anything to an `observe` that needs to be converted.
            while (i--) {
                val = arguments[i];
                args[i] = canMakeObserve(val) ? hookupBubble(val, "*", this, this.constructor.Observe, this.constructor) : val;
            }

            // Call the original method.
            res = orig.apply(this, args);

            if (!this.comparator || args.length) {

                this._triggerChange("" + len, "add", args, undefined);
            }

            return res;
        }
    });

    can.each({

        pop: "length",

        shift: 0
    },
    // Creates a `remove` type method


    function (where, name) {
        list.prototype[name] = function () {

            var args = getArgs(arguments),
                len = where && this.length ? this.length - 1 : 0;

            var res = [][name].apply(this, args)

            // Create a change where the args are
            // `*` - Change on potentially multiple properties.
            // `remove` - Items removed.
            // `undefined` - The new values (there are none).
            // `res` - The old, removed values (should these be unbound).
            // `len` - Where these items were removed.
            this._triggerChange("" + len, "remove", undefined, [res])

            if (res && res.unbind) {
                res.unbind("change" + this._cid)
            }
            return res;
        }
    });

    can.extend(list.prototype, {

        indexOf: function (item) {
            this.attr('length')
            return can.inArray(item, this)
        },


        join: [].join,


        reverse: [].reverse,


        slice: function () {
            var temp = Array.prototype.slice.apply(this, arguments);
            return new this.constructor(temp);
        },


        concat: function () {
            var args = [];
            can.each(can.makeArray(arguments), function (arg, i) {
                args[i] = arg instanceof can.Observe.List ? arg.serialize() : arg;
            });
            return new this.constructor(Array.prototype.concat.apply(this.serialize(), args));
        },


        forEach: function (cb, thisarg) {
            can.each(this, cb, thisarg || this);
        },


        replace: function (newList) {
            if (can.isDeferred(newList)) {
                newList.then(can.proxy(this.replace, this));
            } else {
                this.splice.apply(this, [0, this.length].concat(can.makeArray(newList || [])));
            }

            return this;
        }
    });

    Observe.List = list;
    Observe.setup = function () {
        can.Construct.setup.apply(this, arguments);
        // I would prefer not to do it this way. It should
        // be using the attributes plugin to do this type of conversion.
        this.List = Observe.List({
            Observe: this
        }, {});
    }
    return Observe;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/model',['can/util/library', 'can/observe'], function (can) {

    // ## model.js  
    // `can.Model`  
    // _A `can.Observe` that connects to a RESTful interface._
    // Generic deferred piping function
    var pipe = function (def, model, func) {
        var d = new can.Deferred();
        def.then(function () {
            var args = can.makeArray(arguments);
            args[0] = model[func](args[0]);
            d.resolveWith(d, args);
        }, function () {
            d.rejectWith(this, arguments);
        });

        if (typeof def.abort === 'function') {
            d.abort = function () {
                return def.abort();
            }
        }

        return d;
    },
        modelNum = 0,
        ignoreHookup = /change.observe\d+/,
        getId = function (inst) {
            // Instead of using attr, use __get for performance.
            // Need to set reading
            can.Observe.__reading && can.Observe.__reading(inst, inst.constructor.id)
            return inst.__get(inst.constructor.id);
        },
        // Ajax `options` generator function
        ajax = function (ajaxOb, data, type, dataType, success, error) {

            var params = {};

            // If we get a string, handle it.
            if (typeof ajaxOb == "string") {
                // If there's a space, it's probably the type.
                var parts = ajaxOb.split(/\s+/);
                params.url = parts.pop();
                if (parts.length) {
                    params.type = parts.pop();
                }
            } else {
                can.extend(params, ajaxOb);
            }

            // If we are a non-array object, copy to a new attrs.
            params.data = typeof data == "object" && !can.isArray(data) ? can.extend(params.data || {}, data) : data;

            // Get the url with any templated values filled out.
            params.url = can.sub(params.url, params.data, true);

            return can.ajax(can.extend({
                type: type || "post",
                dataType: dataType || "json",
                success: success,
                error: error
            }, params));
        },
        makeRequest = function (self, type, success, error, method) {
            var args;
            // if we pass an array as `self` it it means we are coming from
            // the queued request, and we're passing already serialized data
            // self's signature will be: [self, serializedData]
            if (can.isArray(self)) {
                args = self[1];
                self = self[0];
            } else {
                args = self.serialize();
            }
            args = [args];
            var deferred,
            // The model.
            model = self.constructor,
                jqXHR;

            // `destroy` does not need data.
            if (type == 'destroy') {
                args.shift();
            }
            // `update` and `destroy` need the `id`.
            if (type !== 'create') {
                args.unshift(getId(self));
            }


            jqXHR = model[type].apply(model, args);

            deferred = jqXHR.pipe(function (data) {
                self[method || type + "d"](data, jqXHR);
                return self;
            });

            // Hook up `abort`
            if (jqXHR.abort) {
                deferred.abort = function () {
                    jqXHR.abort();
                };
            }

            deferred.then(success, error);
            return deferred;
        },

        // This object describes how to make an ajax request for each ajax method.  
        // The available properties are:
        //		`url` - The default url to use as indicated as a property on the model.
        //		`type` - The default http request type
        //		`data` - A method that takes the `arguments` and returns `data` used for ajax.
        ajaxMethods = {

            create: {
                url: "_shortName",
                type: "post"
            },

            update: {
                data: function (id, attrs) {
                    attrs = attrs || {};
                    var identity = this.id;
                    if (attrs[identity] && attrs[identity] !== id) {
                        attrs["new" + can.capitalize(id)] = attrs[identity];
                        delete attrs[identity];
                    }
                    attrs[identity] = id;
                    return attrs;
                },
                type: "put"
            },

            destroy: {
                type: "delete",
                data: function (id) {
                    var args = {};
                    args.id = args[this.id] = id;
                    return args;
                }
            },

            findAll: {
                url: "_shortName"
            },

            findOne: {}
        },
        // Makes an ajax request `function` from a string.
        //		`ajaxMethod` - The `ajaxMethod` object defined above.
        //		`str` - The string the user provided. Ex: `findAll: "/recipes.json"`.
        ajaxMaker = function (ajaxMethod, str) {
            // Return a `function` that serves as the ajax method.
            return function (data) {
                // If the ajax method has it's own way of getting `data`, use that.
                data = ajaxMethod.data ? ajaxMethod.data.apply(this, arguments) :
                // Otherwise use the data passed in.
                data;
                // Return the ajax method with `data` and the `type` provided.
                return ajax(str || this[ajaxMethod.url || "_url"], data, ajaxMethod.type || "get")
            }
        }



        can.Model = can.Observe({
            fullName: "can.Model",
            setup: function (base) {
                // create store here if someone wants to use model without inheriting from it
                this.store = {};
                can.Observe.setup.apply(this, arguments);
                // Set default list as model list
                if (!can.Model) {
                    return;
                }
                this.List = ML({
                    Observe: this
                }, {});
                var self = this,
                    clean = can.proxy(this._clean, self);


                // go through ajax methods and set them up
                can.each(ajaxMethods, function (method, name) {
                    // if an ajax method is not a function, it's either
                    // a string url like findAll: "/recipes" or an
                    // ajax options object like {url: "/recipes"}
                    if (!can.isFunction(self[name])) {
                        // use ajaxMaker to convert that into a function
                        // that returns a deferred with the data
                        self[name] = ajaxMaker(method, self[name]);
                    }
                    // check if there's a make function like makeFindAll
                    // these take deferred function and can do special
                    // behavior with it (like look up data in a store)
                    if (self["make" + can.capitalize(name)]) {
                        // pass the deferred method to the make method to get back
                        // the "findAll" method.
                        var newMethod = self["make" + can.capitalize(name)](self[name]);
                        can.Construct._overwrite(self, base, name, function () {
                            // increment the numer of requests
                            this._reqs++;
                            var def = newMethod.apply(this, arguments);
                            var then = def.then(clean, clean);
                            then.abort = def.abort;

                            // attach abort to our then and return it
                            return then;
                        })
                    }
                });

                if (self.fullName == "can.Model" || !self.fullName) {
                    self.fullName = "Model" + (++modelNum);
                }
                // Add ajax converters.
                this._reqs = 0;
                this._url = this._shortName + "/{" + this.id + "}"
            },
            _ajax: ajaxMaker,
            _makeRequest: makeRequest,
            _clean: function () {
                this._reqs--;
                if (!this._reqs) {
                    for (var id in this.store) {
                        if (!this.store[id]._bindings) {
                            delete this.store[id];
                        }
                    }
                }
                return arguments[0];
            },

            models: function (instancesRawData, oldList) {

                if (!instancesRawData) {
                    return;
                }

                if (instancesRawData instanceof this.List) {
                    return instancesRawData;
                }

                // Get the list type.
                var self = this,
                    tmp = [],
                    res = oldList instanceof can.Observe.List ? oldList : new(self.List || ML),
                    // Did we get an `array`?
                    arr = can.isArray(instancesRawData),

                    // Did we get a model list?
                    ml = (instancesRawData instanceof ML),

                    // Get the raw `array` of objects.
                    raw = arr ?

                    // If an `array`, return the `array`.
                    instancesRawData :

                    // Otherwise if a model list.
                    (ml ?

                    // Get the raw objects from the list.
                    instancesRawData.serialize() :

                    // Get the object's data.
                    instancesRawData.data),
                    i = 0;



                if (res.length) {
                    res.splice(0);
                }

                can.each(raw, function (rawPart) {
                    tmp.push(self.model(rawPart));
                });

                // We only want one change event so push everything at once
                res.push.apply(res, tmp);

                if (!arr) { // Push other stuff onto `array`.
                    can.each(instancesRawData, function (val, prop) {
                        if (prop !== 'data') {
                            res.attr(prop, val);
                        }
                    })
                }
                return res;
            },

            model: function (attributes) {
                if (!attributes) {
                    return;
                }
                if (attributes instanceof this) {
                    attributes = attributes.serialize();
                }
                var id = attributes[this.id],
                    model = (id || id === 0) && this.store[id] ? this.store[id].attr(attributes, this.removeAttr || false) : new this(attributes);
                if (this._reqs) {
                    this.store[attributes[this.id]] = model;
                }
                return model;
            }
        },

        {

            isNew: function () {
                var id = getId(this);
                return !(id || id === 0); // If `null` or `undefined`
            },

            save: function (success, error) {
                return makeRequest(this, this.isNew() ? 'create' : 'update', success, error);
            },

            destroy: function (success, error) {
                if (this.isNew()) {
                    var self = this;
                    return can.Deferred().done(function (data) {
                        self.destroyed(data)
                    }).resolve(self);
                }
                return makeRequest(this, 'destroy', success, error, 'destroyed');
            },

            bind: function (eventName) {
                if (!ignoreHookup.test(eventName)) {
                    if (!this._bindings) {
                        this.constructor.store[this.__get(this.constructor.id)] = this;
                        this._bindings = 0;
                    }
                    this._bindings++;
                }

                return can.Observe.prototype.bind.apply(this, arguments);
            },

            unbind: function (eventName) {
                if (!ignoreHookup.test(eventName)) {
                    this._bindings--;
                    if (!this._bindings) {
                        delete this.constructor.store[getId(this)];
                    }
                }
                return can.Observe.prototype.unbind.apply(this, arguments);
            },
            // Change `id`.
            ___set: function (prop, val) {
                can.Observe.prototype.___set.call(this, prop, val)
                // If we add an `id`, move it to the store.
                if (prop === this.constructor.id && this._bindings) {
                    this.constructor.store[getId(this)] = this;
                }
            }
        });

    can.each({
        makeFindAll: "models",
        makeFindOne: "model"
    }, function (method, name) {
        can.Model[name] = function (oldFind) {
            return function (params, success, error) {
                var def = pipe(oldFind.call(this, params), this, method);
                def.then(success, error);
                // return the original promise
                return def;
            };
        };
    });

    can.each([

    "created",

    "updated",

    "destroyed"], function (funcName) {
        can.Model.prototype[funcName] = function (attrs) {
            var stub, constructor = this.constructor;

            // Update attributes if attributes have been passed
            stub = attrs && typeof attrs == 'object' && this.attr(attrs.attr ? attrs.attr() : attrs);

            // Call event on the instance
            can.trigger(this, funcName);

            // triggers change event that bubble's like
            // handler( 'change','1.destroyed' ). This is used
            // to remove items on destroyed from Model Lists.
            // but there should be a better way.
            can.trigger(this, "change", funcName)


            // Call event on the instance's Class
            can.trigger(constructor, funcName, this);
        };
    });

    // Model lists are just like `Observe.List` except that when their items are 
    // destroyed, it automatically gets removed from the list.
    var ML = can.Model.List = can.Observe.List({
        setup: function () {
            can.Observe.List.prototype.setup.apply(this, arguments);
            // Send destroy events.
            var self = this;
            this.bind('change', function (ev, how) {
                if (/\w+\.destroyed/.test(how)) {
                    var index = self.indexOf(ev.target);
                    if (index != -1) {
                        self.splice(index, 1);
                    }
                }
            })
        }
    })

    return can.Model;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/view',['can/util/library'], function (can) {
    // ## view.js
    // `can.view`  
    // _Templating abstraction._
    var isFunction = can.isFunction,
        makeArray = can.makeArray,
        // Used for hookup `id`s.
        hookupId = 1,

        $view = can.view = function (view, data, helpers, callback) {
            // If helpers is a `function`, it is actually a callback.
            if (isFunction(helpers)) {
                callback = helpers;
                helpers = undefined;
            }

            var pipe = function (result) {
                return $view.frag(result);
            },
                // In case we got a callback, we need to convert the can.view.render
                // result to a document fragment
                wrapCallback = isFunction(callback) ?
                function (frag) {
                    callback(pipe(frag));
                } : null,
                // Get the result.
                result = $view.render(view, data, helpers, wrapCallback),
                deferred = can.Deferred();

            if (isFunction(result)) {
                return result;
            }

            if (can.isDeferred(result)) {
                result.then(function (result, data) {
                    deferred.resolve.call(deferred, pipe(result), data);
                }, function () {
                    deferred.fail.apply(deferred, arguments);
                });
                return deferred;
            }

            // Convert it into a dom frag.
            return pipe(result);
        };

    can.extend($view, {
        // creates a frag and hooks it up all at once
        frag: function (result, parentNode) {
            return $view.hookup($view.fragment(result), parentNode);
        },

        // simply creates a frag
        // this is used internally to create a frag
        // insert it
        // then hook it up
        fragment: function (result) {
            var frag = can.buildFragment(result, document.body);
            // If we have an empty frag...
            if (!frag.childNodes.length) {
                frag.appendChild(document.createTextNode(''));
            }
            return frag;
        },

        // Convert a path like string into something that's ok for an `element` ID.
        toId: function (src) {
            return can.map(src.toString().split(/\/|\./g), function (part) {
                // Dont include empty strings in toId functions
                if (part) {
                    return part;
                }
            }).join("_");
        },

        hookup: function (fragment, parentNode) {
            var hookupEls = [],
                id, func;

            // Get all `childNodes`.
            can.each(fragment.childNodes ? can.makeArray(fragment.childNodes) : fragment, function (node) {
                if (node.nodeType === 1) {
                    hookupEls.push(node);
                    hookupEls.push.apply(hookupEls, can.makeArray(node.getElementsByTagName('*')));
                }
            });

            // Filter by `data-view-id` attribute.
            can.each(hookupEls, function (el) {
                if (el.getAttribute && (id = el.getAttribute('data-view-id')) && (func = $view.hookups[id])) {
                    func(el, parentNode, id);
                    delete $view.hookups[id];
                    el.removeAttribute('data-view-id');
                }
            });

            return fragment;
        },


        hookups: {},


        hook: function (cb) {
            $view.hookups[++hookupId] = cb;
            return " data-view-id='" + hookupId + "'";
        },


        cached: {},

        cachedRenderers: {},


        cache: true,


        register: function (info) {
            this.types["." + info.suffix] = info;
        },

        types: {},


        ext: ".ejs",


        registerScript: function () {},


        preload: function () {},


        render: function (view, data, helpers, callback) {
            // If helpers is a `function`, it is actually a callback.
            if (isFunction(helpers)) {
                callback = helpers;
                helpers = undefined;
            }

            // See if we got passed any deferreds.
            var deferreds = getDeferreds(data);

            if (deferreds.length) { // Does data contain any deferreds?
                // The deferred that resolves into the rendered content...
                var deferred = new can.Deferred(),
                    dataCopy = can.extend({}, data);

                // Add the view request to the list of deferreds.
                deferreds.push(get(view, true))

                // Wait for the view and all deferreds to finish...
                can.when.apply(can, deferreds).then(function (resolved) {
                    // Get all the resolved deferreds.
                    var objs = makeArray(arguments),
                        // Renderer is the last index of the data.
                        renderer = objs.pop(),
                        // The result of the template rendering with data.
                        result;

                    // Make data look like the resolved deferreds.
                    if (can.isDeferred(data)) {
                        dataCopy = usefulPart(resolved);
                    }
                    else {
                        // Go through each prop in data again and
                        // replace the defferreds with what they resolved to.
                        for (var prop in data) {
                            if (can.isDeferred(data[prop])) {
                                dataCopy[prop] = usefulPart(objs.shift());
                            }
                        }
                    }

                    // Get the rendered result.
                    result = renderer(dataCopy, helpers);

                    // Resolve with the rendered view.
                    deferred.resolve(result, dataCopy);

                    // If there's a `callback`, call it back with the result.
                    callback && callback(result, dataCopy);
                }, function () {
                    deferred.reject.apply(deferred, arguments)
                });
                // Return the deferred...
                return deferred;
            }
            else {
                // No deferreds! Render this bad boy.
                var response,
                // If there's a `callback` function
                async = isFunction(callback),
                    // Get the `view` type
                    deferred = get(view, async);

                // If we are `async`...
                if (async) {
                    // Return the deferred
                    response = deferred;
                    // And fire callback with the rendered result.
                    deferred.then(function (renderer) {
                        callback(data ? renderer(data, helpers) : renderer);
                    })
                } else {
                    // if the deferred is resolved, call the cached renderer instead
                    // this is because it's possible, with recursive deferreds to
                    // need to render a view while its deferred is _resolving_.  A _resolving_ deferred
                    // is a deferred that was just resolved and is calling back it's success callbacks.
                    // If a new success handler is called while resoliving, it does not get fired by
                    // jQuery's deferred system.  So instead of adding a new callback
                    // we use the cached renderer.
                    // We also add __view_id on the deferred so we can look up it's cached renderer.
                    // In the future, we might simply store either a deferred or the cached result.
                    if (deferred.state() === "resolved" && deferred.__view_id) {
                        var currentRenderer = $view.cachedRenderers[deferred.__view_id];
                        return data ? currentRenderer(data, helpers) : currentRenderer;
                    } else {
                        // Otherwise, the deferred is complete, so
                        // set response to the result of the rendering.
                        deferred.then(function (renderer) {
                            response = data ? renderer(data, helpers) : renderer;
                        });
                    }
                }

                return response;
            }
        },


        registerView: function (id, text, type, def) {
            // Get the renderer function.
            var func = (type || $view.types[$view.ext]).renderer(id, text);
            def = def || new can.Deferred();

            // Cache if we are caching.
            if ($view.cache) {
                $view.cached[id] = def;
                def.__view_id = id;
                $view.cachedRenderers[id] = func;
            }

            // Return the objects for the response's `dataTypes`
            // (in this case view).
            return def.resolve(func);
        }
    });

    // Makes sure there's a template, if not, have `steal` provide a warning.
    var checkText = function (text, url) {
        if (!text.length) {

            throw "can.view: No template or empty template:" + url;
        }
    },
        // `Returns a `view` renderer deferred.  
        // `url` - The url to the template.  
        // `async` - If the ajax request should be asynchronous.  
        // Returns a deferred.
        get = function (url, async) {
            var suffix = url.match(/\.[\w\d]+$/),
                type,
                // If we are reading a script element for the content of the template,
                // `el` will be set to that script element.
                el,
                // A unique identifier for the view (used for caching).
                // This is typically derived from the element id or
                // the url for the template.
                id,
                // The ajax request used to retrieve the template content.
                jqXHR;

            //If the url has a #, we assume we want to use an inline template
            //from a script element and not current page's HTML
            if (url.match(/^#/)) {
                url = url.substr(1);
            }
            // If we have an inline template, derive the suffix from the `text/???` part.
            // This only supports `<script>` tags.
            if (el = document.getElementById(url)) {
                suffix = "." + el.type.match(/\/(x\-)?(.+)/)[2];
            }

            // If there is no suffix, add one.
            if (!suffix && !$view.cached[url]) {
                url += (suffix = $view.ext);
            }

            if (can.isArray(suffix)) {
                suffix = suffix[0]
            }

            // Convert to a unique and valid id.
            id = $view.toId(url);

            // If an absolute path, use `steal` to get it.
            // You should only be using `//` if you are using `steal`.
            if (url.match(/^\/\//)) {
                var sub = url.substr(2);
                url = !window.steal ? sub : steal.config().root.mapJoin(sub);
            }

            // Set the template engine type.
            type = $view.types[suffix];

            // If it is cached, 
            if ($view.cached[id]) {
                // Return the cached deferred renderer.
                return $view.cached[id];

                // Otherwise if we are getting this from a `<script>` element.
            } else if (el) {
                // Resolve immediately with the element's `innerHTML`.
                return $view.registerView(id, el.innerHTML, type);
            } else {
                // Make an ajax request for text.
                var d = new can.Deferred();
                can.ajax({
                    async: async,
                    url: url,
                    dataType: "text",
                    error: function (jqXHR) {
                        checkText("", url);
                        d.reject(jqXHR);
                    },
                    success: function (text) {
                        // Make sure we got some text back.
                        checkText(text, url);
                        $view.registerView(id, text, type, d)
                    }
                });
                return d;
            }
        },
        // Gets an `array` of deferreds from an `object`.
        // This only goes one level deep.
        getDeferreds = function (data) {
            var deferreds = [];

            // pull out deferreds
            if (can.isDeferred(data)) {
                return [data]
            } else {
                for (var prop in data) {
                    if (can.isDeferred(data[prop])) {
                        deferreds.push(data[prop]);
                    }
                }
            }
            return deferreds;
        },
        // Gets the useful part of a resolved deferred.
        // This is for `model`s and `can.ajax` that resolve to an `array`.
        usefulPart = function (resolved) {
            return can.isArray(resolved) && resolved[1] === 'success' ? resolved[0] : resolved
        };



    can.extend($view, {
        register: function (info) {
            this.types["." + info.suffix] = info;



            $view[info.suffix] = function (id, text) {
                if (!text) {
                    // Return a nameless renderer
                    var renderer = function () {
                        return $view.frag(renderer.render.apply(this, arguments));
                    }
                    renderer.render = function () {
                        var renderer = info.renderer(null, id);
                        return renderer.apply(renderer, arguments);
                    }
                    return renderer;
                }

                $view.preload(id, info.renderer(id, text));
                return can.view(id);
            }
        },
        registerScript: function (type, id, src) {
            return "can.view.preload('" + id + "'," + $view.types["." + type].script(id, src) + ");";
        },
        preload: function (id, renderer) {
            $view.cached[id] = new can.Deferred().resolve(function (data, helpers) {
                return renderer.call(data, data, helpers);
            });

            function frag() {
                return $view.frag(renderer.apply(this, arguments));
            }
            // expose the renderer for mustache
            frag.render = renderer;
            return frag;
        }

    });

    return can;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/observe/compute',['can/util/library'], function (can) {

    // returns the
    // - observes and attr methods are called by func
    // - the value returned by func
    // ex: `{value: 100, observed: [{obs: o, attr: "completed"}]}`
    var getValueAndObserved = function (func, self) {

        var oldReading;
        if (can.Observe) {
            // Set a callback on can.Observe to know
            // when an attr is read.
            // Keep a reference to the old reader
            // if there is one.  This is used
            // for nested live binding.
            oldReading = can.Observe.__reading;
            can.Observe.__reading = function (obj, attr) {
                // Add the observe and attr that was read
                // to `observed`
                observed.push({
                    obj: obj,
                    attr: attr
                });
            };
        }

        var observed = [],
            // Call the "wrapping" function to get the value. `observed`
            // will have the observe/attribute pairs that were read.
            value = func.call(self);

        // Set back so we are no longer reading.
        if (can.Observe) {
            can.Observe.__reading = oldReading;
        }
        return {
            value: value,
            observed: observed
        };
    },
        // Calls `callback(newVal, oldVal)` everytime an observed property
        // called within `getterSetter` is changed and creates a new result of `getterSetter`.
        // Also returns an object that can teardown all event handlers.
        computeBinder = function (getterSetter, context, callback, computeState) {
            // track what we are observing
            var observing = {},
                // a flag indicating if this observe/attr pair is already bound
                matched = true,
                // the data to return 
                data = {
                    // we will maintain the value while live-binding is taking place
                    value: undefined,
                    // a teardown method that stops listening
                    teardown: function () {
                        for (var name in observing) {
                            var ob = observing[name];
                            ob.observe.obj.unbind(ob.observe.attr, onchanged);
                            delete observing[name];
                        }
                    }
                },
                batchNum;

            // when a property value is changed
            var onchanged = function (ev) {
                // If the compute is no longer bound (because the same change event led to an unbind)
                // then do not call getValueAndBind, or we will leak bindings.
                if (computeState && !computeState.bound) {
                    return;
                }
                if (ev.batchNum === undefined || ev.batchNum !== batchNum) {
                    // store the old value
                    var oldValue = data.value,
                        // get the new value
                        newvalue = getValueAndBind();
                    // update the value reference (in case someone reads)
                    data.value = newvalue;
                    // if a change happened
                    if (newvalue !== oldValue) {
                        callback(newvalue, oldValue);
                    }
                    batchNum = batchNum = ev.batchNum;
                }


            };

            // gets the value returned by `getterSetter` and also binds to any attributes
            // read by the call
            var getValueAndBind = function () {
                var info = getValueAndObserved(getterSetter, context),
                    newObserveSet = info.observed;

                var value = info.value;
                matched = !matched;

                // go through every attribute read by this observe
                can.each(newObserveSet, function (ob) {
                    // if the observe/attribute pair is being observed
                    if (observing[ob.obj._cid + "|" + ob.attr]) {
                        // mark at as observed
                        observing[ob.obj._cid + "|" + ob.attr].matched = matched;
                    } else {
                        // otherwise, set the observe/attribute on oldObserved, marking it as being observed
                        observing[ob.obj._cid + "|" + ob.attr] = {
                            matched: matched,
                            observe: ob
                        };
                        ob.obj.bind(ob.attr, onchanged);
                    }
                });

                // Iterate through oldObserved, looking for observe/attributes
                // that are no longer being bound and unbind them
                for (var name in observing) {
                    var ob = observing[name];
                    if (ob.matched !== matched) {
                        ob.observe.obj.unbind(ob.observe.attr, onchanged);
                        delete observing[name];
                    }
                }
                return value;
            };
            // set the initial value
            data.value = getValueAndBind();
            data.isListening = !can.isEmptyObject(observing);
            return data;
        }

        // if no one is listening ... we can not calculate every time
        can.compute = function (getterSetter, context) {
            if (getterSetter && getterSetter.isComputed) {
                return getterSetter;
            }
            // get the value right away
            // TODO: eventually we can defer this until a bind or a read
            var computedData, bindings = 0,
                computed, canbind = true;
            if (typeof getterSetter === "function") {
                computed = function (value) {
                    if (value === undefined) {
                        // we are reading
                        if (computedData) {
                            // If another compute is calling this compute for the value,
                            // it needs to bind to this compute's change so it will re-compute
                            // and re-bind when this compute changes.
                            if (bindings && can.Observe.__reading) {
                                can.Observe.__reading(computed, 'change');
                            }
                            return computedData.value;
                        } else {
                            return getterSetter.call(context || this)
                        }
                    } else {
                        return getterSetter.apply(context || this, arguments)
                    }
                }

            } else {
                // we just gave it a value
                computed = function (val) {
                    if (val === undefined) {
                        // If observing, record that the value is being read.
                        if (can.Observe.__reading) {
                            can.Observe.__reading(computed, 'change');
                        }
                        return getterSetter;
                    } else {
                        var old = getterSetter;
                        getterSetter = val;
                        if (old !== val) {
                            can.Observe.triggerBatch(computed, "change", [val, old]);
                        }

                        return val;
                    }

                }
                canbind = false;
            }

            computed.isComputed = true;

            can.cid(computed, "compute")
            var computeState = {
                bound: false
            };

            computed.bind = function (ev, handler) {
                can.addEvent.apply(computed, arguments);
                if (bindings === 0 && canbind) {
                    computeState.bound = true;
                    // setup live-binding
                    computedData = computeBinder(getterSetter, context || this, function (newValue, oldValue) {
                        can.Observe.triggerBatch(computed, "change", [newValue, oldValue])
                    }, computeState);
                }
                bindings++;
            }

            computed.unbind = function (ev, handler) {
                can.removeEvent.apply(computed, arguments);
                bindings--;
                if (bindings === 0 && canbind) {
                    computedData.teardown();
                    computeState.bound = false;
                }

            };
            return computed;
        };
    can.compute.binder = computeBinder;
    return can.compute;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/view/scanner',['can/view'], function (can) {

    var newLine = /(\r|\n)+/g,
        tagToContentPropMap = {
            option: "textContent",
            textarea: "value"
        },
        // Escapes characters starting with `\`.
        clean = function (content) {
            return content.split('\\').join("\\\\").split("\n").join("\\n").split('"').join('\\"').split("\t").join("\\t");
        },
        reverseTagMap = {
            tr: "tbody",
            option: "select",
            td: "tr",
            th: "tr",
            li: "ul"
        },
        // Returns a tagName to use as a temporary placeholder for live content
        // looks forward ... could be slow, but we only do it when necessary
        getTag = function (tagName, tokens, i) {
            // if a tagName is provided, use that
            if (tagName) {
                return tagName;
            } else {
                // otherwise go searching for the next two tokens like "<",TAG
                while (i < tokens.length) {
                    if (tokens[i] == "<" && reverseTagMap[tokens[i + 1]]) {
                        return reverseTagMap[tokens[i + 1]];
                    }
                    i++;
                }
            }
            return '';
        },
        bracketNum = function (content) {
            return (--content.split("{").length) - (--content.split("}").length);
        },
        myEval = function (script) {
            eval(script);
        },
        attrReg = /([^\s]+)[\s]*=[\s]*$/,
        // Commands for caching.
        startTxt = 'var ___v1ew = [];',
        finishTxt = "return ___v1ew.join('')",
        put_cmd = "___v1ew.push(",
        insert_cmd = put_cmd,
        // Global controls (used by other functions to know where we are).
        // Are we inside a tag?
        htmlTag = null,
        // Are we within a quote within a tag?
        quote = null,
        // What was the text before the current quote? (used to get the `attr` name)
        beforeQuote = null,
        // Whether a rescan is in progress
        rescan = null,
        // Used to mark where the element is.
        status = function () {
            // `t` - `1`.
            // `h` - `0`.
            // `q` - String `beforeQuote`.
            return quote ? "'" + beforeQuote.match(attrReg)[1] + "'" : (htmlTag ? 1 : 0);
        };

    can.view.Scanner = Scanner = function (options) {
        // Set options on self
        can.extend(this, {
            text: {},
            tokens: []
        }, options);

        // Cache a token lookup
        this.tokenReg = [];
        this.tokenSimple = {
            "<": "<",
            ">": ">",
            '"': '"',
            "'": "'"
        };
        this.tokenComplex = [];
        this.tokenMap = {};
        for (var i = 0, token; token = this.tokens[i]; i++) {


            // Save complex mappings (custom regexp)
            if (token[2]) {
                this.tokenReg.push(token[2]);
                this.tokenComplex.push({
                    abbr: token[1],
                    re: new RegExp(token[2]),
                    rescan: token[3]
                });
            }
            // Save simple mappings (string only, no regexp)
            else {
                this.tokenReg.push(token[1]);
                this.tokenSimple[token[1]] = token[0];
            }
            this.tokenMap[token[0]] = token[1];
        }

        // Cache the token registry.
        this.tokenReg = new RegExp("(" + this.tokenReg.slice(0).concat(["<", ">", '"', "'"]).join("|") + ")", "g");
    };

    Scanner.prototype = {

        helpers: [

        {
            name: /\s*\(([\$\w]+)\)\s*->([^\n]*)/,
            fn: function (content) {
                var quickFunc = /\s*\(([\$\w]+)\)\s*->([^\n]*)/,
                    parts = content.match(quickFunc);

                return "function(__){var " + parts[1] + "=can.$(__);" + parts[2] + "}";
            }
        }],

        scan: function (source, name) {
            var tokens = [],
                last = 0,
                simple = this.tokenSimple,
                complex = this.tokenComplex;

            source = source.replace(newLine, "\n");
            source.replace(this.tokenReg, function (whole, part) {
                // offset is the second to last argument
                var offset = arguments[arguments.length - 2];

                // if the next token starts after the last token ends
                // push what's in between
                if (offset > last) {
                    tokens.push(source.substring(last, offset));
                }

                // push the simple token (if there is one)
                if (simple[whole]) {
                    tokens.push(whole);
                }
                // otherwise lookup complex tokens
                else {
                    for (var i = 0, token; token = complex[i]; i++) {
                        if (token.re.test(whole)) {
                            tokens.push(token.abbr);
                            // Push a rescan function if one exists
                            if (token.rescan) {
                                tokens.push(token.rescan(part));
                            }
                            break;
                        }
                    }
                }

                // update the position of the last part of the last token
                last = offset + part.length;
            });

            // if there's something at the end, add it
            if (last < source.length) {
                tokens.push(source.substr(last));
            }

            var content = '',
                buff = [startTxt + (this.text.start || '')],
                // Helper `function` for putting stuff in the view concat.
                put = function (content, bonus) {
                    buff.push(put_cmd, '"', clean(content), '"' + (bonus || '') + ');');
                },
                // A stack used to keep track of how we should end a bracket
                // `}`.  
                // Once we have a `<%= %>` with a `leftBracket`,
                // we store how the file should end here (either `))` or `;`).
                endStack = [],
                // The last token, used to remember which tag we are in.
                lastToken,
                // The corresponding magic tag.
                startTag = null,
                // Was there a magic tag inside an html tag?
                magicInTag = false,
                // The current tag name.
                tagName = '',
                // stack of tagNames
                tagNames = [],
                // Pop from tagNames?
                popTagName = false,
                // Declared here.
                bracketCount, i = 0,
                token, tmap = this.tokenMap;

            // Reinitialize the tag state goodness.
            htmlTag = quote = beforeQuote = null;

            for (;
            (token = tokens[i++]) !== undefined;) {
                if (startTag === null) {
                    switch (token) {
                    case tmap.left:
                    case tmap.escapeLeft:
                    case tmap.returnLeft:
                        magicInTag = htmlTag && 1;
                    case tmap.commentLeft:
                        // A new line -- just add whatever content within a clean.  
                        // Reset everything.
                        startTag = token;
                        if (content.length) {
                            put(content);
                        }
                        content = '';
                        break;
                    case tmap.escapeFull:
                        // This is a full line escape (a line that contains only whitespace and escaped logic)
                        // Break it up into escape left and right
                        magicInTag = htmlTag && 1;
                        rescan = 1;
                        startTag = tmap.escapeLeft;
                        if (content.length) {
                            put(content);
                        }
                        rescan = tokens[i++];
                        content = rescan.content || rescan;
                        if (rescan.before) {
                            put(rescan.before);
                        }
                        tokens.splice(i, 0, tmap.right);
                        break;
                    case tmap.commentFull:
                        // Ignore full line comments.
                        break;
                    case tmap.templateLeft:
                        content += tmap.left;
                        break;
                    case '<':
                        // Make sure we are not in a comment.
                        if (tokens[i].indexOf("!--") !== 0) {
                            htmlTag = 1;
                            magicInTag = 0;
                        }
                        content += token;
                        break;
                    case '>':
                        htmlTag = 0;
                        // content.substr(-1) doesn't work in IE7/8
                        var emptyElement = content.substr(content.length - 1) == "/" || content.substr(content.length - 2) == "--";
                        // if there was a magic tag
                        // or it's an element that has text content between its tags, 
                        // but content is not other tags add a hookup
                        // TODO: we should only add `can.EJS.pending()` if there's a magic tag 
                        // within the html tags.
                        if (magicInTag || !popTagName && tagToContentPropMap[tagNames[tagNames.length - 1]]) {
                            // make sure / of /> is on the left of pending
                            if (emptyElement) {
                                put(content.substr(0, content.length - 1), ",can.view.pending(),\"/>\"");
                            } else {
                                put(content, ",can.view.pending(),\">\"");
                            }
                            content = '';
                            magicInTag = 0;
                        } else {
                            content += token;
                        }
                        // if it's a tag like <input/>
                        if (emptyElement || popTagName) {
                            // remove the current tag in the stack
                            tagNames.pop();
                            // set the current tag to the previous parent
                            tagName = tagNames[tagNames.length - 1];
                            // Don't pop next time
                            popTagName = false;
                        }
                        break;
                    case "'":
                    case '"':
                        // If we are in an html tag, finding matching quotes.
                        if (htmlTag) {
                            // We have a quote and it matches.
                            if (quote && quote === token) {
                                // We are exiting the quote.
                                quote = null;
                                // Otherwise we are creating a quote.
                                // TODO: does this handle `\`?
                            } else if (quote === null) {
                                quote = token;
                                beforeQuote = lastToken;
                            }
                        }
                    default:
                        // Track the current tag
                        if (lastToken === '<') {
                            tagName = token.split(/\s/)[0];
                            if (tagName.indexOf("/") === 0 && tagNames[tagNames.length - 1] === tagName.substr(1)) {
                                // set tagName to the last tagName
                                // if there are no more tagNames, we'll rely on getTag.
                                tagName = tagNames[tagNames.length - 1];
                                popTagName = true;
                            } else {
                                tagNames.push(tagName);
                            }
                        }
                        content += token;
                        break;
                    }
                } else {
                    // We have a start tag.
                    switch (token) {
                    case tmap.right:
                    case tmap.returnRight:
                        switch (startTag) {
                        case tmap.left:
                            // Get the number of `{ minus }`
                            bracketCount = bracketNum(content);

                            // We are ending a block.
                            if (bracketCount == 1) {

                                // We are starting on.
                                buff.push(insert_cmd, "can.view.txt(0,'" + getTag(tagName, tokens, i) + "'," + status() + ",this,function(){", startTxt, content);

                                endStack.push({
                                    before: "",
                                    after: finishTxt + "}));\n"
                                });
                            }
                            else {

                                // How are we ending this statement?
                                last = // If the stack has value and we are ending a block...
                                endStack.length && bracketCount == -1 ? // Use the last item in the block stack.
                                endStack.pop() : // Or use the default ending.
                                {
                                    after: ";"
                                };

                                // If we are ending a returning block, 
                                // add the finish text which returns the result of the
                                // block.
                                if (last.before) {
                                    buff.push(last.before);
                                }
                                // Add the remaining content.
                                buff.push(content, ";", last.after);
                            }
                            break;
                        case tmap.escapeLeft:
                        case tmap.returnLeft:
                            // We have an extra `{` -> `block`.
                            // Get the number of `{ minus }`.
                            bracketCount = bracketNum(content);
                            // If we have more `{`, it means there is a block.
                            if (bracketCount) {
                                // When we return to the same # of `{` vs `}` end with a `doubleParent`.
                                endStack.push({
                                    before: finishTxt,
                                    after: "}));"
                                });
                            }

                            var escaped = startTag === tmap.escapeLeft ? 1 : 0,
                                commands = {
                                    insert: insert_cmd,
                                    tagName: getTag(tagName, tokens, i),
                                    status: status()
                                };

                            for (var ii = 0; ii < this.helpers.length; ii++) {
                                // Match the helper based on helper
                                // regex name value
                                var helper = this.helpers[ii];
                                if (helper.name.test(content)) {
                                    content = helper.fn(content, commands);

                                    // dont escape partials
                                    if (helper.name.source == /^>[\s]*\w*/.source) {
                                        escaped = 0;
                                    }
                                    break;
                                }
                            }

                            // Handle special cases
                            if (typeof content == 'object') {
                                if (content.raw) {
                                    buff.push(content.raw);
                                }
                            } else {
                                // If we have `<%== a(function(){ %>` then we want
                                // `can.EJS.text(0,this, function(){ return a(function(){ var _v1ew = [];`.
                                buff.push(insert_cmd, "can.view.txt(" + escaped + ",'" + tagName + "'," + status() + ",this,function(){ " + (this.text.escape || '') + "return ", content,
                                // If we have a block.
                                bracketCount ?
                                // Start with startTxt `"var _v1ew = [];"`.
                                startTxt :
                                // If not, add `doubleParent` to close push and text.
                                "}));");
                            }

                            if (rescan && rescan.after && rescan.after.length) {
                                put(rescan.after.length);
                                rescan = null;
                            }
                            break;
                        }
                        startTag = null;
                        content = '';
                        break;
                    case tmap.templateLeft:
                        content += tmap.left;
                        break;
                    default:
                        content += token;
                        break;
                    }
                }
                lastToken = token;
            }

            // Put it together...
            if (content.length) {
                // Should be `content.dump` in Ruby.
                put(content);
            }
            buff.push(";");

            var template = buff.join(''),
                out = {
                    out: 'with(_VIEW) { with (_CONTEXT) {' + template + " " + finishTxt + "}}"
                };

            // Use `eval` instead of creating a function, because it is easier to debug.
            myEval.call(out, 'this.fn = (function(_CONTEXT,_VIEW){' + out.out + '});\r\n//@ sourceURL=' + name + ".js");

            return out;
        }
    };

    return Scanner;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/view/render',['can/view', 'can/util/string'], function (can) {
    // text node expando test
    var canExpando = true;
    try {
        document.createTextNode('')._ = 0;
    } catch (ex) {
        canExpando = false;
    }

    var attrMap = {
        "class": "className",
        "value": "value",
        "innerText": "innerText",
        "textContent": "textContent"
    },
        tagMap = {
            "": "span",
            table: "tbody",
            tr: "td",
            ol: "li",
            ul: "li",
            tbody: "tr",
            thead: "tr",
            tfoot: "tr",
            select: "option",
            optgroup: "option"
        },
        attributePlaceholder = '__!!__',
        attributeReplace = /__!!__/g,
        tagToContentPropMap = {
            option: "textContent" in document.createElement("option") ? "textContent" : "innerText",
            textarea: "value"
        },
        bool = can.each(["checked", "disabled", "readonly", "required"], function (n) {
            attrMap[n] = n;
        }),
        // a helper to get the parentNode for a given element el
        // if el is in a documentFragment, it will return defaultParentNode
        getParentNode = function (el, defaultParentNode) {
            return defaultParentNode && el.parentNode.nodeType === 11 ? defaultParentNode : el.parentNode;
        },
        setAttr = function (el, attrName, val) {
            var tagName = el.nodeName.toString().toLowerCase(),
                prop = attrMap[attrName];
            // if this is a special property
            if (prop) {
                // set the value as true / false
                el[prop] = can.inArray(attrName, bool) > -1 ? true : val;
                if (prop === "value" && (tagName === "input" || tagName === "textarea")) {
                    el.defaultValue = val;
                }
            } else {
                el.setAttribute(attrName, val);
            }
        },
        getAttr = function (el, attrName) {
            // Default to a blank string for IE7/8
            return (attrMap[attrName] && el[attrMap[attrName]] ? el[attrMap[attrName]] : el.getAttribute(attrName)) || '';
        },
        removeAttr = function (el, attrName) {
            if (can.inArray(attrName, bool) > -1) {
                el[attrName] = false;
            } else {
                el.removeAttribute(attrName);
            }
        },
        pendingHookups = [],
        // Returns text content for anything other than a live-binding 
        contentText = function (input) {

            // If it's a string, return.
            if (typeof input == 'string') {
                return input;
            }
            // If has no value, return an empty string.
            if (!input && input !== 0) {
                return '';
            }

            // If it's an object, and it has a hookup method.
            var hook = (input.hookup &&

            // Make a function call the hookup method.


            function (el, id) {
                input.hookup.call(input, el, id);
            }) ||

            // Or if it's a `function`, just use the input.
            (typeof input == 'function' && input);

            // Finally, if there is a `function` to hookup on some dom,
            // add it to pending hookups.
            if (hook) {
                pendingHookups.push(hook);
                return '';
            }

            // Finally, if all else is `false`, `toString()` it.
            return "" + input;
        },
        // Returns escaped/sanatized content for anything other than a live-binding
        contentEscape = function (txt) {
            return (typeof txt == 'string' || typeof txt == 'number') ? can.esc(txt) : contentText(txt);
        },
        // a mapping of element ids to nodeList ids
        nodeMap = {},
        // a mapping of ids to text nodes
        textNodeMap = {},
        // a mapping of nodeList ids to nodeList
        nodeListMap = {},
        expando = "ejs_" + Math.random(),
        _id = 0,
        id = function (node) {
            if (canExpando || node.nodeType !== 3) {
                if (node[expando]) {
                    return node[expando];
                }
                else {
                    return node[expando] = (node.nodeName ? "element_" : "obj_") + (++_id);
                }
            }
            else {
                for (var textNodeID in textNodeMap) {
                    if (textNodeMap[textNodeID] === node) {
                        return textNodeID;
                    }
                }

                textNodeMap["text_" + (++_id)] = node;
                return "text_" + _id;
            }
        },
        // removes a nodeListId from a node's nodeListIds
        removeNodeListId = function (node, nodeListId) {
            var nodeListIds = nodeMap[id(node)];
            if (nodeListIds) {
                var index = can.inArray(nodeListId, nodeListIds);

                if (index >= 0) {
                    nodeListIds.splice(index, 1);
                }
                if (!nodeListIds.length) {
                    delete nodeMap[id(node)];
                }
            }
        },
        addNodeListId = function (node, nodeListId) {
            var nodeListIds = nodeMap[id(node)];
            if (!nodeListIds) {
                nodeListIds = nodeMap[id(node)] = [];
            }
            nodeListIds.push(nodeListId);
        },
        tagChildren = function (tagName) {
            var newTag = tagMap[tagName] || "span";
            if (newTag === "span") {
                //innerHTML in IE doesn't honor leading whitespace after empty elements
                return "@@!!@@";
            }
            return "<" + newTag + ">" + tagChildren(newTag) + "</" + newTag + ">";
        };

    can.extend(can.view, {

        pending: function () {
            // TODO, make this only run for the right tagName
            var hooks = pendingHookups.slice(0);
            lastHookups = hooks;
            pendingHookups = [];
            return can.view.hook(function (el) {
                can.each(hooks, function (fn) {
                    fn(el);
                });
            });
        },

        registerNode: function (nodeList) {
            var nLId = id(nodeList);
            nodeListMap[nLId] = nodeList;

            can.each(nodeList, function (node) {
                addNodeListId(node, nLId);
            });
        },

        unregisterNode: function (nodeList) {
            var nLId = id(nodeList);
            can.each(nodeList, function (node) {
                removeNodeListId(node, nLId);
            });
            delete nodeListMap[nLId];
        },


        txt: function (escape, tagName, status, self, func) {
            // call the "wrapping" function and get the binding information
            var binding = can.compute.binder(func, self, function (newVal, oldVal) {
                // call the update method we will define for each
                // type of attribute
                update(newVal, oldVal);
            });

            // If we had no observes just return the value returned by func.
            if (!binding.isListening) {
                return (escape || status !== 0 ? contentEscape : contentText)(binding.value);
            }

            // The following are helper methods or varaibles that will
            // be defined by one of the various live-updating schemes.
            // The parent element we are listening to for teardown
            var parentElement, nodeList, teardown = function () {
                binding.teardown();
                if (nodeList) {
                    can.view.unregisterNode(nodeList);
                }
            },
                // if the parent element is removed, teardown the binding
                setupTeardownOnDestroy = function (el) {
                    can.bind.call(el, 'destroyed', teardown);
                    parentElement = el;
                },
                // if there is no parent, undo bindings
                teardownCheck = function (parent) {
                    if (!parent) {
                        teardown();
                        can.unbind.call(parentElement, 'destroyed', teardown);
                    }
                },
                // the tag type to insert
                tag = (tagMap[tagName] || "span"),
                // this will be filled in if binding.isListening
                update,
                // the property (instead of innerHTML elements) to adjust. For
                // example options should use textContent
                contentProp = tagToContentPropMap[tagName];


            // The magic tag is outside or between tags.
            if (status === 0 && !contentProp) {
                // Return an element tag with a hookup in place of the content
                return "<" + tag + can.view.hook(
                escape ?
                // If we are escaping, replace the parentNode with 
                // a text node who's value is `func`'s return value.


                function (el, parentNode) {
                    // updates the text of the text node
                    update = function (newVal) {
                        node.nodeValue = "" + newVal;
                        teardownCheck(node.parentNode);
                    };

                    var parent = getParentNode(el, parentNode),
                        node = document.createTextNode(binding.value);

                    // When iterating through an Observe.List with no DOM
                    // elements containing the individual items, the parent 
                    // is sometimes incorrect not the true parent of the 
                    // source element. (#153)
                    if (el.parentNode !== parent) {
                        parent = el.parentNode;
                        parent.insertBefore(node, el);
                        parent.removeChild(el);
                    } else {
                        parent.insertBefore(node, el);
                        parent.removeChild(el);
                    }
                    setupTeardownOnDestroy(parent);
                } :
                // If we are not escaping, replace the parentNode with a
                // documentFragment created as with `func`'s return value.


                function (span, parentNode) {
                    // updates the elements with the new content
                    update = function (newVal) {
                        // is this still part of the DOM?
                        var attached = nodes[0].parentNode;
                        // update the nodes in the DOM with the new rendered value
                        if (attached) {
                            makeAndPut(newVal);
                        }
                        teardownCheck(nodes[0].parentNode);
                    };

                    // make sure we have a valid parentNode
                    parentNode = getParentNode(span, parentNode);
                    // A helper function to manage inserting the contents
                    // and removing the old contents
                    var nodes, makeAndPut = function (val) {
                        // create the fragment, but don't hook it up
                        // we need to insert it into the document first
                        var frag = can.view.frag(val, parentNode),
                            // keep a reference to each node
                            newNodes = can.makeArray(frag.childNodes),
                            last = nodes ? nodes[nodes.length - 1] : span;

                        // Insert it in the `document` or `documentFragment`
                        if (last.nextSibling) {
                            last.parentNode.insertBefore(frag, last.nextSibling);
                        } else {
                            last.parentNode.appendChild(frag);
                        }
                        // nodes hasn't been set yet
                        if (!nodes) {
                            can.remove(can.$(span));
                            nodes = newNodes;
                            // set the teardown nodeList
                            nodeList = nodes;
                            can.view.registerNode(nodes);
                        } else {
                            // Update node Array's to point to new nodes
                            // and then remove the old nodes.
                            // It has to be in this order for Mootools
                            // and IE because somehow, after an element
                            // is removed from the DOM, it loses its
                            // expando values.
                            var nodesToRemove = can.makeArray(nodes);
                            can.view.replace(nodes, newNodes);
                            can.remove(can.$(nodesToRemove));
                        }
                    };
                    // nodes are the nodes that any updates will replace
                    // at this point, these nodes could be part of a documentFragment
                    makeAndPut(binding.value, [span]);

                    setupTeardownOnDestroy(parentNode);
                    //children have to be properly nested HTML for buildFragment to work properly
                }) + ">" + tagChildren(tag) + "</" + tag + ">";
                // In a tag, but not in an attribute
            } else if (status === 1) {
                // remember the old attr name
                var attrName = binding.value.replace(/['"]/g, '').split('=')[0];
                pendingHookups.push(function (el) {
                    update = function (newVal) {
                        var parts = (newVal || "").replace(/['"]/g, '').split('='),
                            newAttrName = parts[0];

                        // Remove if we have a change and used to have an `attrName`.
                        if ((newAttrName != attrName) && attrName) {
                            removeAttr(el, attrName);
                        }
                        // Set if we have a new `attrName`.
                        if (newAttrName) {
                            setAttr(el, newAttrName, parts[1]);
                            attrName = newAttrName;
                        }
                    };
                    setupTeardownOnDestroy(el);
                });

                return binding.value;
            } else { // In an attribute...
                var attributeName = status === 0 ? contentProp : status;
                // if the magic tag is inside the element, like `<option><% TAG %></option>`,
                // we add this hookup to the last element (ex: `option`'s) hookups.
                // Otherwise, the magic tag is in an attribute, just add to the current element's
                // hookups.
                (status === 0 ? lastHookups : pendingHookups).push(function (el) {
                    // update will call this attribute's render method
                    // and set the attribute accordingly
                    update = function () {
                        setAttr(el, attributeName, hook.render(), contentProp);
                    };

                    var wrapped = can.$(el),
                        hooks;

                    // Get the list of hookups or create one for this element.
                    // Hooks is a map of attribute names to hookup `data`s.
                    // Each hookup data has:
                    // `render` - A `function` to render the value of the attribute.
                    // `funcs` - A list of hookup `function`s on that attribute.
                    // `batchNum` - The last event `batchNum`, used for performance.
                    hooks = can.data(wrapped, 'hooks');
                    if (!hooks) {
                        can.data(wrapped, 'hooks', hooks = {});
                    }

                    // Get the attribute value.
                    var attr = getAttr(el, attributeName, contentProp),
                        // Split the attribute value by the template.
                        // Only split out the first __!!__ so if we have multiple hookups in the same attribute, 
                        // they will be put in the right spot on first render
                        parts = attr.split(attributePlaceholder),
                        goodParts = [],
                        hook;
                    goodParts.push(parts.shift(), parts.join(attributePlaceholder));

                    // If we already had a hookup for this attribute...
                    if (hooks[attributeName]) {
                        // Just add to that attribute's list of `function`s.
                        hooks[attributeName].bindings.push(binding);
                    } else {
                        // Create the hookup data.
                        hooks[attributeName] = {
                            render: function () {
                                var i = 0,
                                    newAttr = attr.replace(attributeReplace, function () {
                                        return contentText(hook.bindings[i++].value);
                                    });
                                return newAttr;
                            },
                            bindings: [binding],
                            batchNum: undefined
                        };
                    }

                    // Save the hook for slightly faster performance.
                    hook = hooks[attributeName];

                    // Insert the value in parts.
                    goodParts.splice(1, 0, binding.value);

                    // Set the attribute.
                    setAttr(el, attributeName, goodParts.join(""), contentProp);

                    // Bind on change.
                    //liveBind(observed, el, binder,oldObserved);
                    setupTeardownOnDestroy(el);
                });
                return attributePlaceholder;
            }
        },

        replace: function (oldNodeList, newNodes) {
            // for each node in the node list
            oldNodeList = can.makeArray(oldNodeList);

            can.each(oldNodeList, function (node) {
                // for each nodeList the node is in
                can.each(can.makeArray(nodeMap[id(node)]), function (nodeListId) {
                    var nodeList = nodeListMap[nodeListId],
                        startIndex = can.inArray(node, nodeList),
                        endIndex = can.inArray(oldNodeList[oldNodeList.length - 1], nodeList);

                    // remove this nodeListId from each node
                    if (startIndex >= 0 && endIndex >= 0) {
                        for (var i = startIndex; i <= endIndex; i++) {
                            var n = nodeList[i];
                            removeNodeListId(n, nodeListId);
                        }

                        // swap in new nodes into the nodeLIst
                        nodeList.splice.apply(nodeList, [startIndex, endIndex - startIndex + 1].concat(newNodes));

                        // tell these new nodes they belong to the nodeList
                        can.each(newNodes, function (node) {
                            addNodeListId(node, nodeListId);
                        });
                    } else {
                        can.view.unregisterNode(nodeList);
                    }
                });
            });
        },

        canExpando: canExpando,
        // Node mappings
        textNodeMap: textNodeMap,
        nodeMap: nodeMap,
        nodeListMap: nodeListMap
    });

    return can;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/view/ejs',['can/util/library', 'can/view', 'can/util/string', 'can/observe/compute', 'can/view/scanner', 'can/view/render'], function (can) {
    // ## ejs.js
    // `can.EJS`  
    // _Embedded JavaScript Templates._
    // Helper methods.
    var extend = can.extend,
        EJS = function (options) {
            // Supports calling EJS without the constructor
            // This returns a function that renders the template.
            if (this.constructor != EJS) {
                var ejs = new EJS(options);
                return function (data, helpers) {
                    return ejs.render(data, helpers);
                };
            }
            // If we get a `function` directly, it probably is coming from
            // a `steal`-packaged view.
            if (typeof options == "function") {
                this.template = {
                    fn: options
                };
                return;
            }
            // Set options on self.
            extend(this, options);
            this.template = this.scanner.scan(this.text, this.name);
        };


    can.EJS = EJS;


    EJS.prototype.

    render = function (object, extraHelpers) {
        object = object || {};
        return this.template.fn.call(object, object, new EJS.Helpers(object, extraHelpers || {}));
    };

    extend(EJS.prototype, {

        scanner: new can.view.Scanner({

            tokens: [
                ["templateLeft", "<%%"], // Template
                ["templateRight", "%>"], // Right Template
                ["returnLeft", "<%=="], // Return Unescaped
                ["escapeLeft", "<%="], // Return Escaped
                ["commentLeft", "<%#"], // Comment
                ["left", "<%"], // Run --- this is hack for now
                ["right", "%>"], // Right -> All have same FOR Mustache ...
                ["returnRight", "%>"]
            ]
        })
    });


    EJS.Helpers = function (data, extras) {
        this._data = data;
        this._extras = extras;
        extend(this, extras);
    };

    EJS.Helpers.prototype = {

        // TODO Deprecated!!
        list: function (list, cb) {
            can.each(list, function (item, i) {
                cb(item, i, list)
            })
        }
    };

    // Options for `steal`'s build.
    can.view.register({
        suffix: "ejs",
        // returns a `function` that renders the view.
        script: function (id, src) {
            return "can.EJS(function(_CONTEXT,_VIEW) { " + new EJS({
                text: src,
                name: id
            }).template.out + " })";
        },
        renderer: function (id, text) {
            return EJS({
                text: text,
                name: id
            });
        }
    });

    return can;
});
define('can/route',[],function(){
	
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can',['can/util/library', 'can/control/route', 'can/model', 'can/view/ejs', 'can/route'], function (can) {
    return can;
});
/*
 * jQuery JSONP Core Plugin 2.4.0 (2012-08-21)
 *
 * https://github.com/jaubourg/jquery-jsonp
 *
 * Copyright (c) 2012 Julian Aubourg
 *
 * This document is licensed as free software under the terms of the
 * MIT License: http://www.opensource.org/licenses/mit-license.php
 */
( function( $ ) {

	// ###################### UTILITIES ##

	// Noop
	function noop() {
	}

	// Generic callback
	function genericCallback( data ) {
		lastValue = [ data ];
	}

	// Call if defined
	function callIfDefined( method , object , parameters ) {
		return method && method.apply( object.context || object , parameters );
	}

	// Give joining character given url
	function qMarkOrAmp( url ) {
		return /\?/ .test( url ) ? "&" : "?";
	}

	var // String constants (for better minification)
		STR_ASYNC = "async",
		STR_CHARSET = "charset",
		STR_EMPTY = "",
		STR_ERROR = "error",
		STR_INSERT_BEFORE = "insertBefore",
		STR_JQUERY_JSONP = "_jqjsp",
		STR_ON = "on",
		STR_ON_CLICK = STR_ON + "click",
		STR_ON_ERROR = STR_ON + STR_ERROR,
		STR_ON_LOAD = STR_ON + "load",
		STR_ON_READY_STATE_CHANGE = STR_ON + "readystatechange",
		STR_READY_STATE = "readyState",
		STR_REMOVE_CHILD = "removeChild",
		STR_SCRIPT_TAG = "<script>",
		STR_SUCCESS = "success",
		STR_TIMEOUT = "timeout",

		// Window
		win = window,
		// Deferred
		Deferred = $.Deferred,
		// Head element
		head = $( "head" )[ 0 ] || document.documentElement,
		// Page cache
		pageCache = {},
		// Counter
		count = 0,
		// Last returned value
		lastValue,

		// ###################### DEFAULT OPTIONS ##
		xOptionsDefaults = {
			//beforeSend: undefined,
			//cache: false,
			callback: STR_JQUERY_JSONP,
			//callbackParameter: undefined,
			//charset: undefined,
			//complete: undefined,
			//context: undefined,
			//data: "",
			//dataFilter: undefined,
			//error: undefined,
			//pageCache: false,
			//success: undefined,
			//timeout: 0,
			//traditional: false,
			url: location.href
		},

		// opera demands sniffing :/
		opera = win.opera,

		// IE < 10
		oldIE = !!$( "<div>" ).html( "<!--[if IE]><i><![endif]-->" ).find("i").length;

	// ###################### MAIN FUNCTION ##
	function jsonp( xOptions ) {

		// Build data with default
		xOptions = $.extend( {} , xOptionsDefaults , xOptions );

		// References to xOptions members (for better minification)
		var successCallback = xOptions.success,
			errorCallback = xOptions.error,
			completeCallback = xOptions.complete,
			dataFilter = xOptions.dataFilter,
			callbackParameter = xOptions.callbackParameter,
			successCallbackName = xOptions.callback,
			cacheFlag = xOptions.cache,
			pageCacheFlag = xOptions.pageCache,
			charset = xOptions.charset,
			url = xOptions.url,
			data = xOptions.data,
			timeout = xOptions.timeout,
			pageCached,

			// Abort/done flag
			done = 0,

			// Life-cycle functions
			cleanUp = noop,

			// Support vars
			supportOnload,
			supportOnreadystatechange,

			// Request execution vars
			firstChild,
			script,
			scriptAfter,
			timeoutTimer;

		// If we have Deferreds:
		// - substitute callbacks
		// - promote xOptions to a promise
		Deferred && Deferred(function( defer ) {
			defer.done( successCallback ).fail( errorCallback );
			successCallback = defer.resolve;
			errorCallback = defer.reject;
		}).promise( xOptions );

		// Create the abort method
		xOptions.abort = function() {
			!( done++ ) && cleanUp();
		};

		// Call beforeSend if provided (early abort if false returned)
		if ( callIfDefined( xOptions.beforeSend , xOptions , [ xOptions ] ) === !1 || done ) {
			return xOptions;
		}

		// Control entries
		url = url || STR_EMPTY;
		data = data ? ( (typeof data) == "string" ? data : $.param( data , xOptions.traditional ) ) : STR_EMPTY;

		// Build final url
		url += data ? ( qMarkOrAmp( url ) + data ) : STR_EMPTY;

		// Add callback parameter if provided as option
		callbackParameter && ( url += qMarkOrAmp( url ) + encodeURIComponent( callbackParameter ) + "=?" );

		// Add anticache parameter if needed
		!cacheFlag && !pageCacheFlag && ( url += qMarkOrAmp( url ) + "_" + ( new Date() ).getTime() + "=" );

		// Replace last ? by callback parameter
		url = url.replace( /=\?(&|$)/ , "=" + successCallbackName + "$1" );

		// Success notifier
		function notifySuccess( json ) {

			if ( !( done++ ) ) {

				cleanUp();
				// Pagecache if needed
				pageCacheFlag && ( pageCache [ url ] = { s: [ json ] } );
				// Apply the data filter if provided
				dataFilter && ( json = dataFilter.apply( xOptions , [ json ] ) );
				// Call success then complete
				callIfDefined( successCallback , xOptions , [ json , STR_SUCCESS, xOptions ] );
				callIfDefined( completeCallback , xOptions , [ xOptions , STR_SUCCESS ] );

			}
		}

		// Error notifier
		function notifyError( type ) {

			if ( !( done++ ) ) {

				// Clean up
				cleanUp();
				// If pure error (not timeout), cache if needed
				pageCacheFlag && type != STR_TIMEOUT && ( pageCache[ url ] = type );
				// Call error then complete
				callIfDefined( errorCallback , xOptions , [ xOptions , type ] );
				callIfDefined( completeCallback , xOptions , [ xOptions , type ] );

			}
		}

		// Check page cache
		if ( pageCacheFlag && ( pageCached = pageCache[ url ] ) ) {

			pageCached.s ? notifySuccess( pageCached.s[ 0 ] ) : notifyError( pageCached );

		} else {

			// Install the generic callback
			// (BEWARE: global namespace pollution ahoy)
			win[ successCallbackName ] = genericCallback;

			// Create the script tag
			script = $( STR_SCRIPT_TAG )[ 0 ];
			script.id = STR_JQUERY_JSONP + count++;

			// Set charset if provided
			if ( charset ) {
				script[ STR_CHARSET ] = charset;
			}

			opera && opera.version() < 11.60 ?
				// onerror is not supported: do not set as async and assume in-order execution.
				// Add a trailing script to emulate the event
				( ( scriptAfter = $( STR_SCRIPT_TAG )[ 0 ] ).text = "document.getElementById('" + script.id + "')." + STR_ON_ERROR + "()" )
			:
				// onerror is supported: set the script as async to avoid requests blocking each others
				( script[ STR_ASYNC ] = STR_ASYNC )

			;

			// Internet Explorer: event/htmlFor trick
			if ( oldIE ) {
				script.htmlFor = script.id;
				script.event = STR_ON_CLICK;
			}

			// Attached event handlers
			script[ STR_ON_LOAD ] = script[ STR_ON_ERROR ] = script[ STR_ON_READY_STATE_CHANGE ] = function ( result ) {

				// Test readyState if it exists
				if ( !script[ STR_READY_STATE ] || !/i/.test( script[ STR_READY_STATE ] ) ) {

					try {

						script[ STR_ON_CLICK ] && script[ STR_ON_CLICK ]();

					} catch( _ ) {}

					result = lastValue;
					lastValue = 0;
					result ? notifySuccess( result[ 0 ] ) : notifyError( STR_ERROR );

				}
			};

			// Set source
			script.src = url;

			// Re-declare cleanUp function
			cleanUp = function( i ) {
				timeoutTimer && clearTimeout( timeoutTimer );
				script[ STR_ON_READY_STATE_CHANGE ] = script[ STR_ON_LOAD ] = script[ STR_ON_ERROR ] = null;
				head[ STR_REMOVE_CHILD ]( script );
				scriptAfter && head[ STR_REMOVE_CHILD ]( scriptAfter );
			};

			// Append main script
			head[ STR_INSERT_BEFORE ]( script , ( firstChild = head.firstChild ) );

			// Append trailing script if needed
			scriptAfter && head[ STR_INSERT_BEFORE ]( scriptAfter , firstChild );

			// If a timeout is needed, install it
			timeoutTimer = timeout > 0 && setTimeout( function() {
				notifyError( STR_TIMEOUT );
			} , timeout );

		}

		return xOptions;
	}

	// ###################### SETUP FUNCTION ##
	jsonp.setup = function( xOptions ) {
		$.extend( xOptionsDefaults , xOptions );
	};

	// ###################### INSTALL in jQuery ##
	$.jsonp = jsonp;

} )( jQuery );

define("lib/jquery-jsonp/src/jquery.jsonp", function(){});

define('scripts/components/price-generator/models/product-offers-model',[
	'jquery',
	'can',
	'lib/jquery-jsonp/src/jquery.jsonp'
], function( $, can ){

	var OffersModel = can.Model(
	{
		marketSegment: 'COM',
		countryCode: 'US',
		landscape: 'prod',

		timeout: 20000,
		rootNode: 'productOffering',
		requestCount: 0,

		/**
		 * Retrieves product offers for the given productKeys.
		 * 
		 * @param  {Object} params 
		 *         productKeys {Array} required 
		 *         marketSegment {String} defaults 'COM'
		 *         countryCode {String} defaults 'US'
		 *         promoCodes {Array} optional
		 * @return {promise} resolves with OfferModel instance
		 */
		findAll: function( params ){
			var countryCode = params.countryCode || this.countryCode,
				landscape = params.landscape || this.landsscape,
				queryString;

			if( !params ){
				throw new Error('Params not defined');
			} 
			else if( !params.productKeys ){
				throw new Error('ProductKeys not defined in params!');
			}
			else if( !$.isArray( params.productKeys )){
				throw new Error('ProductKeys not an Array!');
			}

			queryString = this.getCountryQueryString( this.getUpperCaseValue( countryCode ) );
			queryString+= '&' + this.getMarketSegmentQueryString( params.marketSegment );
			queryString+= '&' + this.getProductKeyQueryString( params.productKeys );

			if( params.promoCodes && 
				$.isArray( params.promoCodes ) &&
				params.promoCodes.length ) {

				queryString += '&' + this.getPromoCodesQueryString( params.promoCodes );
			}

			if( params.languageCode ){
				queryString += '&language=' + params.languageCode;
			}

			/**
			jquery-jsonp has better error handling mechanism.
			*/
			return $.jsonp ({
				type: 'GET' ,
				url: this.getUrl( countryCode, landscape )+"?callback=?" ,
				callback: this.getCallbackName(),
				data: queryString,
				dataType: 'jsonp' ,
				timeout: this.timeout
			});
		},

		getUpperCaseValue: function( value )
		{
			if ( $.isValue( value ) ){
				return value.toUpperCase();
			}
		},

		getUrl: function( countryCode, landscape ){
			var path = '/svcs/offers/products.json',
				url = this.isNorthAmerica( countryCode ) ? '//store1.' : '//store2.';
			
			switch( landscape ){
				case 'stage':
					url += 'stage.';
					break;
				case 'pre-stage':
					url += 'qa04.';
					break;
				case 'dev':
					url += 'dev04.';	
					break;
			}

			return url += 'adobe.com' + path;
		},	

		getCallbackName: function(){
			return 'productOffers' + this.requestCount++;
		},

		isNorthAmerica: function( countryCode ){
			return ( countryCode === 'US' || countryCode === 'CA' || countryCode === 'MX' );
		},

		getProductKeyQueryString: function( productKeys ){
			return 'product_key=' + productKeys.join( '&product_key=' );
		},

		getCountryQueryString: function( countryCode ){
			return 'countryCode=' + ( countryCode ? countryCode : this.countryCode );
		},

		getMarketSegmentQueryString: function( marketSegment ){
			return 'marketSegment=' + ( marketSegment ? marketSegment : this.marketSegment );
		},

		getPromoCodesQueryString: function( promoCodes ){
			return 'promotion_code=' + promoCodes.join(',');
		},

		models: function( attributes ){
			return this.model( attributes[ this.rootNode ]);
		}
	},

	{

	});

	return OffersModel;	
});
define('scripts/components/common/util/number-util',[
], function(){

	return {

		/**
		 * Formats the given number using the given format mask.
		 * Rounds values and works with negative numbers. 
		 * 
		 * @param  {String} mask  Masking string ( '#,##0.00' )
		 * @param  {Number} value The number to format
		 * @return {String}       The number as a formated string.
		 */
		formatByMask: function( mask, value ){ 
            if (!mask || isNaN(+value)) {
                return value; //return as it is.
            }
            //convert any string to number according to formation sign.
            value = mask.charAt(0) === '-'? -value: +value;
            var isNegative = value<0? value= -value: 0; //process only abs(), and turn on flag.
            
            //search for separator for grp & decimal, anything not digit, not +/- sign, not #.
            var result = mask.match(/[^\d\-\+#]/g);
            var Decimal = (result && result[result.length-1]) || '.'; //treat the right most symbol as decimal 
            var Group = (result && result[1] && result[0]) || ',';  //treat the left most symbol as group separator
            
            //split the decimal for the format string if any.
            mask = mask.split( Decimal);
            //Fix the decimal first, toFixed will auto fill trailing zero.
            value = value.toFixed( mask[1] && mask[1].length);
            value = +(value) + ''; //convert number to string to trim off *all* trailing decimal zero(es)

            //fill back any trailing zero according to format
            var pos_trail_zero = mask[1] && mask[1].lastIndexOf('0'); //look for last zero in format
            var part = value.split('.');
            //integer will get !part[1]
            if (!part[1] || part[1] && part[1].length <= pos_trail_zero) {
                value = (+value).toFixed( pos_trail_zero+1);
            }
            var szSep = mask[0].split( Group); //look for separator
            mask[0] = szSep.join(''); //join back without separator for counting the pos of any leading 0.

            var pos_lead_zero = mask[0] && mask[0].indexOf('0');
            if (pos_lead_zero > -1 ) {
                while (part[0].length < (mask[0].length - pos_lead_zero)) {
                    part[0] = '0' + part[0];
                }
            }
            else if (+part[0] === 0){
                part[0] = '';
            }
            
            value = value.split('.');
            value[0] = part[0];
            
            //process the first group separator from decimal (.) only, the rest ignore.
            //get the length of the last slice of split result.
            var pos_separator = ( szSep[1] && szSep[ szSep.length-1].length);
            if (pos_separator) {
                var integer = value[0];
                var str = '';
                var offset = integer.length % pos_separator;
                for (var i=0, l=integer.length; i<l; i++) { 
                    
                    str += integer.charAt(i); //ie6 only support charAt for sz.
                    //-pos_separator so that won't trail separator on full length
                    // acaciopp: to pass lint, had to change the following line from this:
                    // if ( !( ( i-offset+1 ) % pos_separator ) && ( i<l-pos_separator )) {
                    if ( ( ( i-offset+1 ) % pos_separator )===0 && ( i<l-pos_separator )) {
                        str += Group;
                    }
                }
                value[0] = str;
            }

            value[1] = (mask[1] && value[1])? Decimal+value[1] : "";
            return (isNegative?'-':'') + value[0] + value[1]; //put back any negation and combine integer and fraction.
        }

	};
	
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can-proxy',['can/util/library', 'can/construct'], function (can, Construct) {
    var isFunction = can.isFunction,
        isArray = can.isArray,
        makeArray = can.makeArray,

        proxy = function (funcs) {

            //args that should be curried
            var args = makeArray(arguments),
                self;

            // get the functions to callback
            funcs = args.shift();

            // if there is only one function, make funcs into an array
            if (!isArray(funcs)) {
                funcs = [funcs];
            }

            // keep a reference to us in self
            self = this;


            return function class_cb() {
                // add the arguments after the curried args
                var cur = args.concat(makeArray(arguments)),
                    isString, length = funcs.length,
                    f = 0,
                    func;

                // go through each function to call back
                for (; f < length; f++) {
                    func = funcs[f];
                    if (!func) {
                        continue;
                    }

                    // set called with the name of the function on self (this is how this.view works)
                    isString = typeof func == "string";

                    // call the function
                    cur = (isString ? self[func] : func).apply(self, cur || []);

                    // pass the result to the next function (if there is a next function)
                    if (f < length - 1) {
                        cur = !isArray(cur) || cur._use_call ? [cur] : cur
                    }
                }
                return cur;
            }
        }
        can.Construct.proxy = can.Construct.prototype.proxy = proxy;
    // this corrects the case where can/control loads after can/construct/proxy, so static props don't have proxy
    var correctedClasses = [can.Observe, can.Control, can.Model],
        i = 0;
    for (; i < correctedClasses.length; i++) {
        if (correctedClasses[i]) {
            correctedClasses[i].proxy = proxy;
        }
    }
    return can;
});
define('price-generator',[
	'jquery',
	'can',
	'scripts/components/price-generator/models/product-offers-model',
	'scripts/components/common/util/number-util',
	'can-proxy'
], function( $, can, ProductOffersModel, NumberUtil ){

	var PriceGenerator = can.Construct(
	{
		defaults: {
			landscape: 'prod', // ['prod' | 'stage' | 'pre-stage' | 'dev' ]
			countryCode: 'US',
			marketSegment: 'COM',
			promoCodes: []
		}
	},
	{
		init: function( options ){
			this.options = $.extend( {}, this.constructor.defaults, options );
		},

		getPrices : function( params ){
			var options = $.extend( {}, this.options, params ),
				deferred = new $.Deferred(),
				self = this;

			ProductOffersModel.findAll( options )
								.done( this.proxy( "productPriceSuccess", deferred ) )
								.fail( this.proxy( "productPriceFailed", deferred ) );

			return deferred.promise();
		},

		productPriceSuccess: function( deferred, data ){
			var priceObject = this.getPriceObjects( data );
			if( $.isEmptyObject( priceObject ) ) {
				deferred.reject( { errorType: 'NO_PRICE_DATA_FOUND' } );
			} else{
				deferred.resolve( priceObject );
			}
		},

		productPriceFailed: function( deferred, data ){
			deferred.reject( { errorType: 'INVALID_PRICE_REQUEST' } );
		},

		getPriceObjects : function( rawData ){
			var currency = rawData.attr('currency'),
				offers = rawData.attr('productOffers'),
				data = {},
				self = this;

			try {
				$.each( offers, function( index, offer ){
					data[ offer.attr('productKey') ] = self.getProductPrices( currency, offer );
				});
			} catch( err ) { 
				//do nothing
			}
			return data;
		},

		getProductPrices : function( currencyObj, offer ){
			var self = this,
				pricesObj = {};

			$.each( offer.attr('priceMap'), function( index, price ){
				pricesObj[ price.attr('priceTypeKey') ] = self.getPriceParts( currencyObj, price.attr( 'price' ));
			});

			return pricesObj;
		},

		getPriceParts : function( currencyObj, priceObj ){
			var price = priceObj.display_price,
				priceWithoutTax = priceObj.priceWithoutTax,
				priceWithTax = priceObj.priceWithTax,
				originalPrice = this.getOriginalPrice( priceObj ),
				formatString = currencyObj.formatString,
				priceParts = {
					price : price,
					priceWithoutTax : priceWithoutTax,
					priceWithTax : priceWithTax,
					formattedPrice : this.getFormattedPrice( currencyObj, price ),
					formattedPriceWithoutTax : this.getFormattedPrice( currencyObj, priceWithoutTax ),
					formattedPriceWithTax : this.getFormattedPrice( currencyObj, priceWithTax ),
					symbol : this.getCurrencySymbol( currencyObj ),
					decimalDelim : this.getDecimalDelim( currencyObj ),
					thousandDelim : formatString.match(/#.(?=#)/)[0].replace(/#/,''),
					includesTax : priceObj.attr('includes_tax')
				};

			if( originalPrice ){
				priceParts.originalPrice = originalPrice;
				priceParts.formattedOriginalPrice = this.getFormattedPrice( currencyObj, originalPrice );
				priceParts.originalPriceWithTax = priceObj.orginalPriceWithTax;
				priceParts.formattedOriginalPriceWithTax = this.getFormattedPrice( currencyObj, priceObj.orginalPriceWithTax );
				priceParts.originalPriceWithoutTax = priceObj.orginalPriceWithoutTax;
				priceParts.formattedOriginalPriceWithoutTax = this.getFormattedPrice( currencyObj, priceObj.orginalPriceWithoutTax );
			}

			return priceParts;
		},

		getOriginalPrice : function( priceObj ){
			return  priceObj.includes_tax ? priceObj.orginalPriceWithTax : priceObj.orginalPriceWithoutTax;
		},

		getFormattedPrice : function( currencyObj, price ){
			var symbol = this.getCurrencySymbol( currencyObj ), 
				formatString = currencyObj.formatString,
				mask = this.getNumberMask( currencyObj ),
				formatedPrice = NumberUtil.formatByMask( mask, price );

			return ( formatString.replace( /'.*'/, 'SYMBOL' ).replace(/#.*0/, formatedPrice ).replace( /SYMBOL/, symbol ));
		},

		getCurrencySymbol: function( currencyObj ){
			var mask = currencyObj.formatString;
			return mask.match( /'(.*?)'/ )[1];
		},

		getNumberMask : function( currencyObj ){
			var formatString = currencyObj.formatString,
				mask = $.trim( formatString.replace(/'.*'/, '')),
				usePrecision = currencyObj.usePrecision;

			return usePrecision ? mask : mask + '.';
		},

		getDecimalDelim : function( currencyObj ){
			var formatString = currencyObj.formatString,
				match = formatString.match(/0.(?=0)/);

			return match ? match[0].replace(/0/,'') : '';
		}
	});

	return PriceGenerator;
	
});
define( 'scripts/components/common/util/lang',['jquery' ], function( $ ) {

	/*
	 * @class adobe/jquery/lang
	 * @tag home
	 * @test adobe/jquery/qunit.html
	 *
	 * Serveral of the methods in this plugin use code
	 * adapted from YUI
	 */

	$.extend( {

		/**
		 * Returns a string representing the type of the item passed in.
		 * @function type
		 * @param o the item to test
		 * @return {string} the detected type
		 */
		type: function( o ) {

			var TYPES = {
				'undefined': 'undefined',
				'number': 'number',
				'boolean': 'boolean',
				'string': 'string',
				'[object Function]': 'function',
				'[object RegExp]': 'regexp',
				'[object Array]': 'array',
				'[object Date]': 'date',
				'[object Error]': 'error'
			};

			return  TYPES[typeof o] || TYPES[ Object.prototype.toString.call( o )] || (o ? 'object' : 'null');
		},

		/**
		 * Determines whether or not the provided item is a boolean
		 * @function isBoolean
		 * @static
		 * @param o The object to test
		 * @return {boolean} true if o is a boolean
		 */
		isBoolean: function( o ) {
			return typeof o === 'boolean';
		},

		/**
		 * Determines whether or not the provided item is null
		 * @function isNull
		 * @static
		 * @param o The object to test
		 * @return {boolean} true if o is null
		 */
		isNull: function( o ) {
			return o === null;
		},

		/**
		 * Determines whether or not the provided item is a legal number
		 * @function isNumber
		 * @static
		 * @param o The object to test
		 * @return {boolean} true if o is a number
		 */
		isNumber: function( o ) {
			return typeof o === 'number' && isFinite( o );
		},

		/**
		 * Determines whether or not the provided item is a string
		 * @function isString
		 * @static
		 * @param o The object to test
		 * @return {boolean} true if o is a string
		 */
		isString: function( o ) {
			return typeof o === 'string';
		},

		/**
		 * Determines whether or not the provided item is undefined
		 * @function isUndefined
		 * @static
		 * @param o The object to test
		 * @return {boolean} true if o is undefined
		 */
		isUndefined: function( o ) {
			return typeof o === 'undefined';
		},

		/**
		 * A convenience method for detecting a legitimate non-null value.
		 * Returns false for null/undefined/NaN, true for other values,
		 * including 0/false/''
		 * @function isValue
		 * @static
		 * @param o The item to test
		 * @return {boolean} true if it is not null/undefined/NaN || false
		 */
		isValue: function( o ) {
			var t = this.type( o );
			switch( t ) {
			case 'number':
				return isFinite( o );
			case 'null':
			case 'undefined':
				return false;
			default:
				return !!(t);
			}
		},


		/**
		 * Determines whether or not the supplied item is a date instance
		 * @function isDate
		 * @static
		 * @param o The object to test
		 * @return {boolean} true if o is a date
		 */
		isDate: function( o ) {
			// return o instanceof Date;
			return this.type( o ) === 'date';
		},

		/**
		 * @function timeStampToDate
		 * @param {String} timestamp
		 * @return {Date}
		 */
		timeStampToDate: function( timestamp ) {
			var regex = new RegExp( "^([\\d]{4})-([\\d]{2})-([\\d]{2})T([\\d]{2}):([\\d]{2}):([\\d]{2}\\.?[\\d]{0,3})([\\+\\-])([\\d]{2}):([\\d]{2})$" ),
				matches = regex.exec( timestamp ),
				offset,
				result;

			if( matches != null ) {
				offset = parseInt( matches[8], 10 ) * 60 + parseInt( matches[9], 10 );

				if( matches[7] === "-" ) {
					offset = -offset;
				}

				result = new Date(
					Date.UTC(
						parseInt( matches[1], 10 ),
						parseInt( matches[2], 10 ) - 1,
						parseInt( matches[3], 10 ),
						parseInt( matches[4], 10 ),
						parseInt( matches[5], 10 ),
						parseInt( matches[6], 10 )
					) - offset * 60 * 1000
				);

				return result;
			}

			return null;
		},

		/**
		 * @function ISO8601DateString
		 * @param {Date} timestamp
		 * @return {String}
		 */
		ISO8601DateString : function (d) {
			function pad(n){ return n<10 ? '0'+n : n; }
			return d.getUTCFullYear()+'-' +
				pad(d.getUTCMonth()+1)+'-' +
				pad(d.getUTCDate())+'T' +
				pad(d.getUTCHours())+':' +
				pad(d.getUTCMinutes())+':' +
				pad(d.getUTCSeconds())+'Z';
		},

		isPrimitive: function( o ) {
			var t = this.type( o );
			switch( t ) {
			case 'undefined' :
			case 'number' :
			case 'boolean' :
			case 'string' :
				return true;
			default:
				return false;
			}
		},

		/**
		 * Returns true if the object contains a given key
		 * @function hasKey
		 * @static
		 * @param o an object
		 * @param k the key to query
		 * @return {boolean} true if the object contains the key
		 */
		hasKey: function( o, k ) {
			// return (o.hasOwnProperty(k));
			return (k in o);
		},

		/**
		 * Executes the supplied function on each item in the array.
		 * Returning true from the processing function will stop the
		 * processing of the remaining
		 * items.
		 * @function some
		 * @param a {Array} the array to iterate
		 * @param f {Function} the function to execute on each item. The function
		 * receives three arguments: the value, the index, the full array.
		 * @param o Optional context object
		 * @static
		 * @return {boolean} true if the function returns true on
		 * any of the items in the array
		 */
		some: (Array.prototype.some) ?
			function(a, f, o){
				return Array.prototype.some.call(a, f, o);
			} :
			function(a, f, o){
				var l = a.length, i;
				for (i = 0; i < l; i = i + 1) {
					if (f.call(o, a[i], i, a)) {
						return true;
					}
				}
				return false;
			},


		/**
		 * Returns an object using the first array as keys, and
		 * the second as values.  If the second array is not
		 * provided the value is set to true for each.
		 *
		 * @function hash
		 * @static
		 * @param k {Array} keyset
		 * @param v {Array} optional valueset
		 * @return {object} the hash
		 */
		hash: function(k, v){
			var o = {}, l = k.length, vl = v && v.length, i;
			for (i = 0; i < l; i = i + 1) {
				o[k[i]] = (vl && vl > i) ? v[i] : true;
			}

			return o;
		},


		/**
		 * This will not be needed once we port to jmvc
		 * @param {Object} ns
		 */
		createNs: function( ns ) {
			var o, a;

			a = ns.split( "." );
			o = window[a[0]] = window[a[0]] || {};

			$.each( a.slice( 1 ), function( i, n ) {
				o = o[n] = o[n] || {};
			} );

			return o;
		},

		rgb2hex: function( rgb ) {
			var hexDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"],
				rgbVal = rgb.match( /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/ );

			function hex( num ) {
				return isNaN( num ) ? "00" : hexDigits[(num - num % 16) / 16] + hexDigits[num % 16];
			}

			return "#" + hex( rgbVal[1] ) + hex( rgbVal[2] ) + hex( rgbVal[3] );
		},

		localToGlobal: function( context, localX, localY ) {
			// Get the position of the context element.
			var result = {},
				position = context.offset();

			// Set the X/Y in the global context.
			result.x = Math.floor( localX + position.left );
			result.y = Math.floor( localY + position.top );

			return result;
		},

		globalToLocal: function( context, globalX, globalY ) {
			// Get the position of the context element.
			var result = {},
				position = context.offset();

			// Set the X/Y in the local context.
			result.x = Math.floor( globalX - position.left );
			result.y = Math.floor( globalY - position.top );

			return result;
		}

	} );

	return jQuery;

} );


define('scripts/components/common/util/can-string-util',['can'], function (can) {
    var strUndHash = /_|-/, 
        strColons = /\=\=/, 
        strWords = /([A-Z]+)([A-Z][a-z])/g, 
        strLowUp = /([a-z\d])([A-Z])/g, 
        strDash = /([a-z\d])([A-Z])/g, 
        strReplacer = /\{([^\}]+)\}/g, 
        strQuote = /"/g, 
        strSingleQuote = /'/g, 
        strHyphenMatch = /-+(.)?/g, 
        strHyphenUndMatch = /(\-|_)+(.)?/g,
        strCamelMatch = /[a-z][A-Z]/g, 
        getNext = function (obj, prop, add) {
            var result = obj[prop];
            if (result === undefined && add === true) {
                result = obj[prop] = {};
            }
            return result;
        }, 
        isContainer = function (current) {
            return /^f|^o/.test(typeof current);
        }, 
        convertBadValues = function (content) {
            var isInvalid = content === null || content === undefined || isNaN(content) && '' + content === 'NaN';
            return '' + (isInvalid ? '' : content);
        };

    can.extend(can, {
        esc: function (content) {
            return convertBadValues(content).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(strQuote, '&#34;').replace(strSingleQuote, '&#39;');
        },
        getObject: function (name, roots, add) {
            var parts = name ? name.split('.') : [], length = parts.length, current, r = 0, i, container, rootsLength;
            roots = can.isArray(roots) ? roots : [roots || window];
            rootsLength = roots.length;
            if (!length) {
                return roots[0];
            }
            for (r; r < rootsLength; r++) {
                current = roots[r];
                container = undefined;
                for (i = 0; i < length && isContainer(current); i++) {
                    container = current;
                    current = getNext(container, parts[i]);
                }
                if (container !== undefined && current !== undefined) {
                    break;
                }
            }
            if (add === false && current !== undefined) {
                delete container[parts[i - 1]];
            }
            if (add === true && current === undefined) {
                current = roots[0];
                for (i = 0; i < length && isContainer(current); i++) {
                    current = getNext(current, parts[i], true);
                }
            }
            return current;
        },
        capitalize: function (s, cache) {
            return s.charAt(0).toUpperCase() + s.slice(1);
        },
        camelize: function (str) {
            return convertBadValues(str).replace(strHyphenUndMatch, function (match, chr, chr2 ){ 
                return chr2 ? chr2.toUpperCase() : '';
            });
        },
        hyphenate: function (str) {
            return convertBadValues(str).replace(strCamelMatch, function (str, offset) {
                return str.charAt(0) + '-' + str.charAt(1).toLowerCase();
            });
        },
        underscore: function (s) {
            return s.replace(strColons, '/').replace(strWords, '$1_$2').replace(strLowUp, '$1_$2').replace(strDash, '_').toLowerCase();
        },
        sub: function (str, data, remove) {
            var obs = [];
            str = str || '';
            obs.push(str.replace(strReplacer, function (whole, inside) {
                var ob = can.getObject(inside, data, remove === true ? false : undefined);
                if (ob === undefined || ob === null) {
                    obs = null;
                    return '';
                }
                if (isContainer(ob) && obs) {
                    obs.push(ob);
                    return '';
                }
                return '' + ob;
            }));
            return obs === null ? obs : obs.length <= 1 ? obs[0] : obs;
        },
        replacer: strReplacer,
        undHash: strUndHash
    });
    return can;
});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can-super',['can/util/library', 'can/construct'], function (can, Construct) {

    // tests if we can get super in .toString()
    var isFunction = can.isFunction,

        fnTest = /xyz/.test(function () {
            xyz;
        }) ? /\b_super\b/ : /.*/;

    // overwrites a single property so it can still call super
    can.Construct._overwrite = function (addTo, base, name, val) {
        // Check if we're overwriting an existing function
        addTo[name] = isFunction(val) && isFunction(base[name]) && fnTest.test(val) ? (function (name, fn) {
            return function () {
                var tmp = this._super,
                    ret;

                // Add a new ._super() method that is the same method
                // but on the super-class
                this._super = base[name];

                // The method only need to be bound temporarily, so we
                // remove it when we're done executing
                ret = fn.apply(this, arguments);
                this._super = tmp;
                return ret;
            };
        })(name, val) : val;
    }
    // overwrites an object with methods, sets up _super
    //   newProps - new properties
    //   oldProps - where the old properties might be
    //   addTo - what we are adding to
    can.Construct._inherit = function (newProps, oldProps, addTo) {
        addTo = addTo || newProps
        for (var name in newProps) {
            can.Construct._overwrite(addTo, oldProps, name, newProps[name]);
        }
    }

    return can;
});
define('scripts/components/product-configurator/models/product-configuration-model',[
	'jquery',
	'can',
	'scripts/components/common/util/lang',
	'scripts/components/common/util/can-string-util',
	'can-super'
], function( $, can ){

	var ConfigurationModel = can.Observe({

		domains: {
			'prod': 'store1.adobe.com',
			'stage': 'store1.stage.adobe.com',
			'pre-stage': 'store1.qa04.adobe.com',
			'dev': 'store1.dev04.adobe.com'
		},

		rootNode: 'InlineConfigurator',

		/**
		 * 
		 *
		 **/
		findAll: function( params ){
			var deferred = new $.Deferred(),
				url = this.getServiceUrl( params ),
				self = this;

			$.ajax({
				url : url,
				type: 'GET',
				dataType: 'jsonp',
				data: {
					marketSegment: params.marketSegment,
					countryCode: params.countryCode,
					locale: this.getLocale( params )
				},
				jsonpCallback: this.getCallbackName( params.productKey )
			}).then( function( rawData ){
				
				var data = self.processData( rawData[ self.rootNode ] ),
					instance = new self( data );

				deferred.resolve( instance );
			}).fail( function( jqXHR, status, errorThrown ){
				deferred.reject( { errorType: 'PRODUCT_DATA_NOT_FOUND' });
			});

			return deferred.promise();
		},

		getServiceUrl: function( params ){
			var domain = this.domains[ params.landscape || 'prod' ];
			return '//' + domain + '/svcs/products' + params.productKey + '/configurator.json';
		},

		getLocale: function( params ){
			return params.languageCode + '_' + params.countryCode.toLowerCase();
		},

		getCallbackName: function( productKey ){
			return "config" + productKey.replace(/\//g,'_');
		},

		processData: function( rawData ){

			var data = {
					productKey : rawData.productKey,
					currency : rawData.currency,
					configurationType : rawData.configurationType,
					skus: this.normalizeResultSet( rawData.skus ),
					createDate: new Date( rawData.create_date ),
					priceDisplay: rawData.price_display 
				};

			if( rawData.qualifyingProducts ){
				data.qualifyingProducts = this.normalizeResultSet( rawData.qualifyingProducts );
			}

			return data;
		},

		/**
		 * Takes a resultSet object with a columns {Array} and data {Array} properties
		 * and merges them into a single array of objects with named properties.
		 **/
		normalizeResultSet: function( resultSet ){
			var rs = [],
				propertyNames = this.normalizeColumnNames( resultSet.columns ),
				records = resultSet.data;

			$.each( records, function( idx, record ){

				// clean up 'null' values
				for( var prop in record.data ){
					if( record.data[ prop ] === 'null'){
						record.data[ prop ] = null;
					}
				}

				rs.push( $.hash( propertyNames, record.data ));
			});

			return rs;
		},

		normalizeColumnNames: function( columns ){
			var normalNames = [];
			$.each( columns, function( idx, name ){
				normalNames.push( can.camelize( name.toLowerCase() ));
			});

			return normalNames;
		}

	},
	{
		init: function(){
			this.attr( 'filteredSkus', new can.Observe.List( [] ));
			this.setupFilteredSkuData();
		},

		setupFilteredSkuData: function(){
			this.attr( 'filteredSkus' ).replace( this.skus.slice( 0 ));
			this.filterHistory = [];
		},

		filterProductData: function( fieldName, value ){

			if( this.filterAppliedPreviously( fieldName )){
				this.revertDataToEarlierState( fieldName );
			}

			this.applyFilter( fieldName, value );
			this.saveFilter( fieldName, value );
		},

		getSkusWithDistinctFieldValues: function( fieldName ){
			var distinctSkus = [],
				values = {},
				skus = this.attr('filteredSkus'),
				len = skus.length,
				sku,
				value;

			for( var i=0; i<len; i++ ){
				sku = skus[ i ];
				value = sku[ fieldName ];

				// get unique values, ignoring null and ''
				if( value !== '' && value !== null && !$.hasKey( values, value )){
					values[ value ] = 1;
					distinctSkus.push( sku );
				}
			}

			return distinctSkus;
		},

		applyFilter: function( fieldName, value ){

			var filteredData = this.attr( 'filteredSkus' ),
				filterFunc = function( aRecord ){
					return ( aRecord[ fieldName ] === value );
				};

			if( !$.isValue( value )){ 
				return; 
			}

			filteredData = $.grep( filteredData, filterFunc );
			this.attr( 'filteredSkus' ).replace( filteredData );
		},

		saveFilter: function( fieldName, value ){
			var filterObj = {
					fieldName: fieldName,
					value: value,
					data: this.filteredSkus.slice(0) //copy array
				};

			this.filterHistory.push( filterObj );
		},

		filterAppliedPreviously: function( fieldName ){
			var func = function( aFilter ){
					return ( aFilter.fieldName === fieldName );
				};

			return ( $.grep( this.filterHistory, func ).length > 0 );
		},

		revertDataToEarlierState: function( fieldName ){
			var history = this.filterHistory;

			this.rollbackFilters( fieldName );

			if( history.length ) {
				this.attr( 'filteredSkus' ).replace( history[ history.length-1 ].data );
			} 
			else {
				this.attr( 'filteredSkus' ).replace( this.skus.slice( 0 ));
			}
		},

		rollbackFilters: function( fieldName ){
			var history = this.filterHistory,
				currentFilter;

			do {
				currentFilter = history.pop();
			}
			while( currentFilter.fieldName !== fieldName );
		},

		resetAllFilters: function(){
			this.setupFilteredSkuData();
		}

	});

	return ConfigurationModel;
});
/**
 * @license RequireJS text 2.0.14 Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
  define, window, process, Packages,
  java, location, Components, FileUtils */

define('text',['module'], function (module) {
    'use strict';

    var text, fs, Cc, Ci, xpcIsWindows,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = {},
        masterConfig = (module.config && module.config()) || {};

    text = {
        version: '2.0.14',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "strip"
         * where strip is a boolean.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.lastIndexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                   (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                   ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, strip, content, onLoad) {
            content = strip ? text.strip(content) : content;
            if (masterConfig.isBuild) {
                buildMap[name] = content;
            }
            onLoad(content);
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config && config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config && config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                         text.useXhr;

            // Do not load if it is an empty: url
            if (url.indexOf('empty:') === 0) {
                onLoad();
                return;
            }

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.strip, content, onLoad);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                                    parsed.strip, content, onLoad);
                });
            }
        },

        write: function (pluginName, moduleName, write, config) {
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = text.jsEscape(buildMap[moduleName]);
                write.asModule(pluginName + "!" + moduleName,
                               "define(function () { return '" +
                                   content +
                               "';});\n");
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
                //Use a '.js' file name so that it indicates it is a
                //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node &&
            !process.versions['node-webkit'] &&
            !process.versions['atom-shell'])) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback, errback) {
            try {
                var file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file[0] === '\uFEFF') {
                    file = file.substring(1);
                }
                callback(file);
            } catch (e) {
                if (errback) {
                    errback(e);
                }
            }
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
            text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status || 0;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        if (errback) {
                            errback(err);
                        }
                    } else {
                        callback(xhr.responseText);
                    }

                    if (masterConfig.onXhrComplete) {
                        masterConfig.onXhrComplete(xhr, url);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
            typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                if (line !== null) {
                    stringBuffer.append(line);
                }

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
            typeof Components !== 'undefined' && Components.classes &&
            Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes;
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        xpcIsWindows = ('@mozilla.org/windows-registry-key;1' in Cc);

        text.get = function (url, callback) {
            var inStream, convertStream, fileObj,
                readData = {};

            if (xpcIsWindows) {
                url = url.replace(/\//g, '\\');
            }

            fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                           .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});


define('text!scripts/components/product-configurator/views/filter-control-view.ejs',[],function () { return '<label class="control-label col-sm-3"><%= displayName %></label>\n<div class="col-sm-9">\n\n<%\n\tif( dataProvider.attr( \'length\' ) > 1 ){\n%>\n\t<select class="form-control">\n\t\t<% \n\n\t\tlist( dataProvider, function( item, index ){ \n\t\t\tvar name = item.attr( labelField ),\n\t\t\t\tvalue = item.attr( fieldName );\n\t\t%>\n\t\t\n\t\t<option value="<%= value %>"<% if( value === defaultValue ){ %> selected="selected" <%}%>><%== name %></option>\n\t\t\n\t\t<% }); %>\n\t\t\n\t</select>\n<%\n\t}\n\telse {\n%>\n\t<p class="form-control-static"><%== dataProvider.attr( \'0.\' + labelField ) %></p>\n<%\n\t}\n%>\n</div>';});

define('scripts/components/product-configurator/filter-control',[
	'jquery',
	'can',
	'text!./views/filter-control-view.ejs',
	'scripts/components/common/util/lang',
	'can-proxy'
], function( $, can, viewTemplate ){

	var FilterControl = can.Control({

	},
	{
		init: function() {
			this.name = this.options.name;
		},

		// called from factory after mixins applied
		initialize: function(){
			this.createViewModel();
			this.setDataProvider();
			this.renderView();
		},

		createViewModel: function(){
			this.viewModel = new can.Observe({
				displayName: this.options.displayName,
				fieldName: this.options.fieldName,
				labelField: this.options.labelField,
				defaultValue: '',
				dataProvider: new can.Observe.List([])
			});
		},

		setDataProvider: function(){
			var model = this.options.model,
				fieldName = this.options.fieldName,
				sortFunc = this.options.sortFunction,
				dataProvider = this.viewModel.attr( 'dataProvider' ),
				dp = model.getSkusWithDistinctFieldValues( fieldName );

			if( sortFunc ){
				dp.sort( sortFunc );
			}

			this.setDefaultValue( dp );
			dataProvider.replace( dp );
			this.setVisible();
		},

		setDefaultValue: function( dataProvider ){
			var fieldName = this.options.fieldName,
				defaultValues = this.options.defaultValue,
				len, value,
				checkFunc = function( item ){
					return item[ fieldName ] === value;
				};

			if( $.isArray( defaultValues )){
				len = defaultValues.length;

				for( var i=0; i<len; i++ ){
					value = defaultValues[ i ];
					if( $.some( dataProvider, checkFunc )){	
						break;
					}
				}
			}
			else {
				value = defaultValues;
			}

			this.viewModel.attr( 'defaultValue', value );
		},

		setVisible: function(){
			var dataProvider = this.viewModel.attr( 'dataProvider' ),
				len = dataProvider.length;

			switch( len ){
				case 0:
					this.element.hide();
					break;
				case 1:
					this.showSingleValueState();
					break;
				default:
					this.element.show();
			}
		},

		showSingleValueState: function(){

			var fieldName = this.options.fieldName,
				value = this.viewModel.attr( 'dataProvider.0.' + fieldName );

			if( this.options.hideSingleValue || !this.isValidValue( value )){
				this.element.hide();
			}
			else {
				this.element.show();
			}
		},

		isValidValue: function( value ){
			return ( value !== 'N/A' && value !== 'NONE' && value !== '' && value !== 'null' && value !== null );
		},

		renderView: function(){
			can.view.ejs( 'viewEJS', viewTemplate );
			this.element.html( can.view( 'viewEJS',  this.viewModel ));
		},

		applyFilter : function(){
			this.options.configurator.filterProductData( this );
		},

		getValue: function(){
			return this.element.find( 'select' ).val() || this.viewModel.dataProvider.attr( '0.' + this.options.fieldName );
		},

		getFieldName: function(){
			return this.options.fieldName;
		},

		'select change': function(){
			this.viewModel.attr( 'defaultValue', this.getValue() );
			this.applyFilter();
		}

	});

	return FilterControl;

});
define('scripts/components/product-configurator/filter-control-factory',[
	'jquery',
	'can',
	'./filter-control'
], function( $, can, FilterControl ){
	
	var FilterFactory = can.Construct({

		DISTRIBUTION : 'DISTRIBUTION',
		UPGRADE : 'UPGRADE',
		VERSION : 'VERSION',
		SERVICE_COMMITMENT : 'SERVICE_COMMITMENT',
		PLATFORM : 'PLATFORM',
		LANGUAGE : 'LANGUAGE',
		FULFILLMENT : 'FULFILLMENT',
		TERM_TYPE : 'TERM_TYPE',
		QUANTITY : 'QUANTITY',

		controllerProps : {

			DISTRIBUTION:{
				fieldName : 'distributionMethod',
				labelField : 'distributionMethodLabel',
				displayName : 'I want to buy:',
				sortFunction : function(a,b){ return b.price - a.price; },
				hideSingleValue : false,
				defaultValue : 'FULL',
				name: 'DISTRIBUTION'
			},

			UPGRADE: {
				fieldName : 'upgradeGroup',
				labelField : 'name',
				valueField : 'productKey',
				displayName : 'Upgrade from:',
				truncate : true,
				hideSingleValue : false,
				defaultValue : null,
				name : 'UPGRADE'
			},

			VERSION	: {
				fieldName : 'versionString',
				labelField : 'versionString',
				displayName : 'Version:',
				hideSingleValue : true,
				defaultValue : null,
				name : 'VERSION'
			},

			SERVICE_COMMITMENT : {
				fieldName : 'serviceCommitment',
				labelField : 'serviceCommitmentLabel',
				displayName : 'Plan:',
				hideSingleValue : false,
				defaultValue : 'YEAR',
				name : 'SERVICE_COMMITMENT'
			},

			PLATFORM: {
				fieldName : 'platformCode',
				labelField : 'platformLabel',
				displayName : 'Platform:',
				hideSingleValue : false,
				defaultValue : 'Windows',
				name : 'PLATFORM'
			},

			LANGUAGE: {
				fieldName : 'languageCode',
				labelField : 'language',
				displayName : 'Language:',
				hideSingleValue : false,
				defaultValue : 'EN',
				name : 'LANGUAGE'
			},

			FULFILLMENT: {
				fieldName : 'fulfillmentMethodType',
				labelField : 'fulfillmentMethodTypeLabel',
				displayName : 'Delivery:',
				sortFunction : function( a, b ){
					var nameA = a.fulfillmentMethodTypeLabel.toLowerCase(), 
						nameB = b.fulfillmentMethodTypeLabel.toLowerCase();

					if( nameA < nameB ){
						return -1;
					}
						
					if( nameA > nameB ){
						return 1;
					}
						
					return 0;
				},
				hideSingleValue : true,
				defaultValue : 'SOFTGOOD',
				name : 'FULFILLMENT'
			},

			TERM_TYPE:{
				fieldName : 'termType',
				labelField : 'termTypeLabel',
				displayName : 'Plan:',
				hideSingleValue : true,
				defaultValue : 'ANNUAL',
				name : 'TERM_TYPE'
			},

			QUANTITY: {
				fieldName : 'quantity',
				labelField  : 'quantity',
				displayName : 'Quantity:',
				hideSingleValue : false,
				defaultValue : 1,
				name : 'QUANTITY'
			}
		},

		controlMixins: {
			UPGRADE : {
				setDataProvider : function(){
					var model = this.options.model,
						fieldName = this.options.fieldName,
						dataProvider = this.viewModel.attr( 'dataProvider' ),
						upgradeGroups = model.getSkusWithDistinctFieldValues( fieldName ),
						dp = upgradeGroups.length > 1 ? model.attr('qualifyingProducts') : [];

					dataProvider.replace( dp );
					this.setVisible();
				}
			},

			QUANTITY: {
				setDataProvider : function(){
					var model = this.options.model,
						dataProvider = this.viewModel.attr( 'dataProvider' ),
						maxQuantities = model.getSkusWithDistinctFieldValues( 'maxCartQty' ),
						maxQty = maxQuantities.length === 1 ? maxQuantities[0]['maxCartQty'] : 9,
						dp = [];

					for( var i=1; i <= maxQty; i++ ){
						dp.push( { quantity: String( i )} );
					}

					dataProvider.replace( dp );
					this.setVisible();
				},

				applyFilter : function(){
					this.options.configurator.skusFiltered();
				},
			}
		}

	},
	{
		init: function( configurator ){
			this.configurator = configurator;
		},

		getFilterControl: function( type, options ){
			var props = this.getFilterControlOptions( type, options ),
				containerClass = 'form-group configurator-control ' + type.toLowerCase(),
				$elem = $('<div class="' + containerClass + '">'),
				control = new FilterControl( $elem, props );

			this.addControlMixins( control );
			control.initialize();

			return control;
		},

		getFilterControlOptions: function( type, options ){
			var opts = this.constructor.controllerProps[ type ],
				passedInOptions = options[ opts.fieldName ] || {};

			$.extend( opts, passedInOptions );

			opts.model = this.configurator.model;
			opts.configurator = this.configurator;
			
			return opts;
		},

		addControlMixins: function( control ){
			var type = control.name,
				methods = this.constructor.controlMixins[ type ];

			$.extend( control, methods );
		}
	});

	return FilterFactory;

});
/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('lib/canjs/amd/can/control/plugin',['jquery', 'can/util/library', 'can/control'], function ($, can) {
    //used to determine if a control instance is one of controllers
    //controllers can be strings or classes
    var i, isAControllerOf = function (instance, controllers) {
        for (i = 0; i < controllers.length; i++) {
            if (typeof controllers[i] == 'string' ? instance.constructor._shortName == controllers[i] : instance instanceof controllers[i]) {
                return true;
            }
        }
        return false;
    },
        makeArray = can.makeArray,
        old = can.Control.setup;

    can.Control.setup = function () {
        // if you didn't provide a name, or are control, don't do anything
        if (this !== can.Control) {


            var pluginName = this.pluginName || this._fullName;

            // create jQuery plugin
            if (pluginName !== 'can_control') {
                this.plugin(pluginName);
            }

            old.apply(this, arguments);
        }
    };

    $.fn.extend({


        controls: function () {
            var controllerNames = makeArray(arguments),
                instances = [],
                controls, c, cname;
            //check if arguments
            this.each(function () {

                controls = can.$(this).data("controls");
                if (!controls) {
                    return;
                }
                for (var i = 0; i < controls.length; i++) {
                    c = controls[i];
                    if (!controllerNames.length || isAControllerOf(c, controllerNames)) {
                        instances.push(c);
                    }
                }
            });
            return instances;
        },


        control: function (control) {
            return this.controls.apply(this, arguments)[0];
        }
    });

    can.Control.plugin = function (pluginname) {
        var control = this;

        if (!$.fn[pluginname]) {
            $.fn[pluginname] = function (options) {

                var args = makeArray(arguments),
                    //if the arg is a method on this control
                    isMethod = typeof options == "string" && $.isFunction(control.prototype[options]),
                    meth = args[0],
                    returns;
                this.each(function () {
                    //check if created
                    var plugin = can.$(this).control(control);

                    if (plugin) {
                        if (isMethod) {
                            // call a method on the control with the remaining args
                            returns = plugin[meth].apply(plugin, args.slice(1));
                        }
                        else {
                            // call the plugin's update method
                            plugin.update.apply(plugin, args);
                        }
                    }
                    else {
                        //create a new control instance
                        control.newInstance.apply(control, [this].concat(args));
                    }
                });
                return returns !== undefined ? returns : this;
            };
        }
    }

    can.Control.prototype.update = function (options) {
        can.extend(this.options, options);
        this.on();
    };

    return can;
});
define('product-configurator',[
	'jquery',
	'can',
	'scripts/components/product-configurator/models/product-configuration-model',
	'scripts/components/product-configurator/filter-control-factory',
	'lib/canjs/amd/can/control/plugin',
	'can-proxy'
], function( $, can, ProductConfigurationModel, FilterControlFactory ){

	var ProductConfigurator = can.Control({

		pluginName: 'anyware_product_configurator',

		defaults : {
			countryCode: 'US',
			languageCode: 'en',
			marketSegment: 'COM',
			landscape: 'prod',
			containerClass: 'form-horizontal',
			filterControlOptions: {
				distributionMethod: {
					displayName : 'I want to buy:',
					defaultValue: [ 'SUB_NEW', 'FULL' ],
					hideSingleValue: true
				},
				upgradeGroup: {
					displayName : 'Upgrade from:',
					defaultValue: null,
					hideSingleValue: true,
				},
				versionString: {
					displayName : 'Version:',
					defaultValue: null,
					hideSingleValue: true,
				},
				serviceCommitment: {
					displayName : 'Plan:',
					defaultValue: 'YEAR',
					hideSingleValue: true
				},
				platformCode: {
					displayName : 'Platform:',
					defaultValue: [ 'Mac/Win', 'Windows' ],
					hideSingleValue: true,
				},
				languageCode: {
					displayName : 'Language:',
					defaultValue: [ 'MULT', 'EN' ],
					hideSingleValue: true
				},
				fulfillmentMethod: {
					displayName : 'Delivery:',
					defaultValue: 'SOFTGOOD',
					hideSingleValue: true
				},
				termType: {
					displayName : 'Plan:',
					defaultValue: 'ANNUAL',
					hideSingleValue: true
				},
				quantity: {
					displayName : 'Quantity:',
					defaultValue: 1,
					hideSingleValue: true
				}
			}
		},

		MISSING_ARGUMENTS_ERROR : 'Configurator: You must provide either a productModel or productKey plugin options'
	},
	{
		init: function(){
			var opts = this.options;

			if( !( opts.productKey || opts.model )){
				throw new Error( this.constructor.MISSING_ARGUMENTS_ERROR );
			}

			this.element.addClass( this.options.containerClass );
			this.currentFilterIndex = 0;

			if( opts.model ){
				this.dataLoaded( opts.model );
			}
			else {
				this.loadProductData();
			}
		},

		loadProductData: function(){
			var self = this;

			ProductConfigurationModel.findAll( this.options )
				.then( this.proxy( 'dataLoaded' ))
				.fail( this.proxy( 'dataLoadError' ));
		},

		dataLoaded: function( model ){
			this.model = model;
			this.setupListeners();
			this.setupFilterControls();
			this.beginConfigutation();
		},

		dataLoadError: function( error ){
			this.element.trigger( 'errorEvent', error );
		},

		beginConfigutation: function(){
			var filter = this.filterControls[ 0 ];
			this.filterProductData( filter );
		},

		filterProductData: function( filter ){

			if( this.model.filterAppliedPreviously( filter.getFieldName() )){
				this.setCurrentFilterIndex( filter.name );
			}

			if( this.isCurrentFilter( filter.name )){
				this.applyFilter( filter );
				this.resetRemainingFilters();
			}
		},

		applyFilter: function( filter ){
			this.model.filterProductData( filter.getFieldName(), filter.getValue() );
			this.currentFilterIndex++;
		},

		resetRemainingFilters: function(){
			var filters = this.filterControls,
				len = filters.length,
				currentIndex = this.currentFilterIndex,
				currentFilter = filters[ currentIndex ],
				filter;

			for( var i=currentIndex; i < len; i++ ){
				filter = filters[ i ];
				filter.setDataProvider();
			}

			if( currentFilter ){
				currentFilter.applyFilter();
			}
		},

		getSelectedSku: function(){
			var skus = this.model.attr( 'filteredSkus' ),
				sku;

			if( skus.length === 1 ){
				sku = skus.attr( '0' );
				sku.attr( 'quantity', this.getQuantity() );
			}

			return sku;
		},

		getQuantity: function(){
			return this.filterControls[ this.getFilterIndex( 'QUANTITY' )].getValue();
		},

		//------- FILTER INDEX METHOD --------------------------------------------

		isCurrentFilter: function( filterName ){
			return this.currentFilterIndex === this.getFilterIndex( filterName );
		},

		setCurrentFilterIndex: function( filterName ){
			this.currentFilterIndex = this.getFilterIndex( filterName );
		},

		getFilterIndex: function( filterName ){
			var filters = this.filterControls,
				len = filters.length;

			for( var i=0; i < len; i++ ){
				if( filters[i].name === filterName ){
					return i;
				}
			}

			return -1;
		},

		//------- EVENT HANDLERS --------------------------------------------------

		setupListeners: function(){
			this.model.attr( 'filteredSkus' ).bind( 'change', this.proxy( 'skusFiltered' ));
		},

		skusFiltered: function(){
			var numSkus = this.model.attr( 'filteredSkus.length' ),
				selectedSku;

			if( numSkus === 1 ){
				selectedSku =  this.getSelectedSku();
			}

			this.element.trigger( 'modelChanged', { 
				numberOfSkus: numSkus, 
				model: this.model,
				selectedSku: selectedSku 
			});
		},


		// ------- SETUP METHODS ---------------------------------------------------

		setupFilterControls: function(){
			var list = this.getFilterControlList(),
				factory = new FilterControlFactory( this ),
				cons = this.filterControls = [],
				filterOptions = this.options.filterControlOptions,
				filter;

			for( var i=0; i < list.length; i++ ){
				filter = factory.getFilterControl( list[i], filterOptions );
				this.element.append( filter.element );
				cons.push( filter );
			}
		},

		getFilterControlList : function(){
			var useUpgrade = this.dataIncludesQualifyingProducts(),
				configType = this.getConfigurationType(),
				f = FilterControlFactory,
				list;

			switch (configType) {
				case 'STANDARD':
					list = useUpgrade ?
							[f.DISTRIBUTION,f.UPGRADE,f.SERVICE_COMMITMENT,f.PLATFORM,f.LANGUAGE,f.FULFILLMENT,f.QUANTITY] :
							[f.DISTRIBUTION,f.VERSION,f.SERVICE_COMMITMENT,f.PLATFORM,f.LANGUAGE,f.FULFILLMENT,f.QUANTITY];
					break;
				case 'SUBSCRIPTION':
					list = [f.TERM_TYPE,f.QUANTITY];
					break;
			}

			return list;
		},

		dataIncludesQualifyingProducts: function(){
			var qProducts = this.model.attr( 'qualifyingProducts' );
			return (qProducts && qProducts.length > 0 );
		},

		getConfigurationType: function(){
			var configType = this.model.attr('configurationType');

			return configType === 'SSP_SUBSCRIPTION' ? 'SUBSCRIPTION' : 'STANDARD';
		}

	});

	return ProductConfigurator;
});
/*******************************************************************************
 * OpenAjax-mashup.js
 *
 * Reference implementation of the OpenAjax Hub, as specified by OpenAjax Alliance.
 * Specification is under development at: 
 *
 *   http://www.openajax.org/member/wiki/OpenAjax_Hub_Specification
 *
 * Copyright 2006-2009 OpenAjax Alliance
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not 
 * use this file except in compliance with the License. You may obtain a copy 
 * of the License at http://www.apache.org/licenses/LICENSE-2.0 . Unless 
 * required by applicable law or agreed to in writing, software distributed 
 * under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR 
 * CONDITIONS OF ANY KIND, either express or implied. See the License for the 
 * specific language governing permissions and limitations under the License.
 *
 ******************************************************************************/

define('OpenAjax/hub/hub',[],function(){


var OpenAjax = window.OpenAjax || {};

if ( !OpenAjax.hub ) {  // prevent re-definition of the OpenAjax.hub object

window.OpenAjax = OpenAjax;

OpenAjax.hub = function() {
    var libs = {};
    var ooh = "org.openajax.hub.";

    return /** @scope OpenAjax.hub */ {
        implementer: "http://openajax.org",
        implVersion: "2.0.7",
        specVersion: "2.0",
        implExtraData: {},
        libraries: libs,
    
        registerLibrary: function(prefix, nsURL, version, extra) {
            libs[prefix] = {
                prefix: prefix,
                namespaceURI: nsURL,
                version: version,
                extraData: extra 
            };
            this.publish(ooh+"registerLibrary", libs[prefix]);
        },
        
        unregisterLibrary: function(prefix) {
            this.publish(ooh+"unregisterLibrary", libs[prefix]);
            delete libs[prefix];
        }
    };
}();

/**
 * Error
 * 
 * Standard Error names used when the standard functions need to throw Errors.
 */
OpenAjax.hub.Error = {
    // Either a required argument is missing or an invalid argument was provided
    BadParameters: "OpenAjax.hub.Error.BadParameters",
    // The specified hub has been disconnected and cannot perform the requested
    // operation:
    Disconnected: "OpenAjax.hub.Error.Disconnected",
    // Container with specified ID already exists:
    Duplicate: "OpenAjax.hub.Error.Duplicate",
    // The specified ManagedHub has no such Container (or it has been removed)
    NoContainer: "OpenAjax.hub.Error.NoContainer",
    // The specified ManagedHub or Container has no such subscription
    NoSubscription: "OpenAjax.hub.Error.NoSubscription",
    // Permission denied by manager's security policy
    NotAllowed: "OpenAjax.hub.Error.NotAllowed",
    // Wrong communications protocol identifier provided by Container or HubClient
    WrongProtocol: "OpenAjax.hub.Error.WrongProtocol",
    // A 'tunnelURI' param was specified, but current browser does not support security features
    IncompatBrowser: "OpenAjax.hub.Error.IncompatBrowser"
};

/**
 * SecurityAlert
 * 
 * Standard codes used when attempted security violations are detected. Unlike
 * Errors, these codes are not thrown as exceptions but rather passed into the 
 * SecurityAlertHandler function registered with the Hub instance.
 */
OpenAjax.hub.SecurityAlert = {
    // Container did not load (possible frame phishing attack)
    LoadTimeout: "OpenAjax.hub.SecurityAlert.LoadTimeout",
    // Hub suspects a frame phishing attack against the specified container
    FramePhish: "OpenAjax.hub.SecurityAlert.FramePhish",
    // Hub detected a message forgery that purports to come to a specified
    // container
    ForgedMsg: "OpenAjax.hub.SecurityAlert.ForgedMsg"
};

/**
 * Debugging Help
 *
 * OpenAjax.hub.enableDebug
 *
 *      If OpenAjax.hub.enableDebug is set to true, then the "debugger" keyword
 *      will get hit whenever a user callback throws an exception, thereby
 *      bringing up the JavaScript debugger.
 */
OpenAjax.hub._debugger = function() {
    if ( OpenAjax.hub.enableDebug ) debugger; // REMOVE ON BUILD
}

////////////////////////////////////////////////////////////////////////////////

/**
 * Hub interface
 * 
 * Hub is implemented on the manager side by ManagedHub and on the client side
 * by ClientHub.
 */
//OpenAjax.hub.Hub = function() {}

/**
 * Subscribe to a topic.
 *
 * @param {String} topic
 *     A valid topic string. MAY include wildcards.
 * @param {Function} onData   
 *     Callback function that is invoked whenever an event is 
 *     published on the topic
 * @param {Object} [scope]
 *     When onData callback or onComplete callback is invoked,
 *     the JavaScript "this" keyword refers to this scope object.
 *     If no scope is provided, default is window.
 * @param {Function} [onComplete]
 *     Invoked to tell the client application whether the 
 *     subscribe operation succeeded or failed. 
 * @param {*} [subscriberData]
 *     Client application provides this data, which is handed
 *     back to the client application in the subscriberData
 *     parameter of the onData callback function.
 * 
 * @returns subscriptionID
 *     Identifier representing the subscription. This identifier is an 
 *     arbitrary ID string that is unique within this Hub instance
 * @type {String}
 * 
 * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
 * @throws {OpenAjax.hub.Error.BadParameters} if the topic is invalid (e.g. contains an empty token)
 */
//OpenAjax.hub.Hub.prototype.subscribe = function( topic, onData, scope, onComplete, subscriberData ) {}

/**
 * Publish an event on a topic
 *
 * @param {String} topic
 *     A valid topic string. MUST NOT include wildcards.
 * @param {*} data
 *     Valid publishable data. To be portable across different
 *     Container implementations, this value SHOULD be serializable
 *     as JSON.
 *     
 * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
 * @throws {OpenAjax.hub.Error.BadParameters} if the topic cannot be published (e.g. contains 
 *     wildcards or empty tokens) or if the data cannot be published (e.g. cannot be serialized as JSON)
 */
//OpenAjax.hub.Hub.prototype.publish = function( topic, data ) {}

/**
 * Unsubscribe from a subscription
 *
 * @param {String} subscriptionID
 *     A subscriptionID returned by Hub.subscribe()
 * @param {Function} [onComplete]
 *     Callback function invoked when unsubscribe completes
 * @param {Object} [scope]
 *     When onComplete callback function is invoked, the JavaScript "this"
 *     keyword refers to this scope object.
 *     If no scope is provided, default is window.
 *     
 * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
 * @throws {OpenAjax.hub.Error.NoSubscription} if no such subscription is found
 */
//OpenAjax.hub.Hub.prototype.unsubscribe = function( subscriptionID, onComplete, scope ) {}

/**
 * Return true if this Hub instance is in the Connected state.
 * Else returns false.
 * 
 * This function can be called even if the Hub is not in a CONNECTED state.
 * 
 * @returns Boolean
 * @type {Boolean}
 */
//OpenAjax.hub.Hub.prototype.isConnected = function() {}

/**
 * Returns the scope associated with this Hub instance and which will be used
 * with callback functions.
 * 
 * This function can be called even if the Hub is not in a CONNECTED state.
 * 
 * @returns scope object
 * @type {Object}
 */
//OpenAjax.hub.Hub.prototype.getScope = function() {}

/**
 * Returns the subscriberData parameter that was provided when 
 * Hub.subscribe was called.
 *
 * @param {String} subscriptionID
 *     The subscriberID of a subscription
 * 
 * @returns subscriberData
 * @type {*}
 * 
 * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
 * @throws {OpenAjax.hub.Error.NoSubscription} if there is no such subscription
 */
//OpenAjax.hub.Hub.prototype.getSubscriberData = function(subscriptionID) {}

/**
 * Returns the scope associated with a specified subscription.  This scope will
 * be used when invoking the 'onData' callback supplied to Hub.subscribe().
 *
 * @param {String} subscriberID
 *     The subscriberID of a subscription
 * 
 * @returns scope
 * @type {*}
 * 
 * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
 * @throws {OpenAjax.hub.Error.NoSubscription} if there is no such subscription
 */
//OpenAjax.hub.Hub.prototype.getSubscriberScope = function(subscriberID) {}

/**
 * Returns the params object associated with this Hub instance.
 *
 * @returns params
 *     The params object associated with this Hub instance
 * @type {Object}
 */
//OpenAjax.hub.Hub.prototype.getParameters = function() {}

////////////////////////////////////////////////////////////////////////////////

/**
 * HubClient interface 
 * 
 * Extends Hub interface.
 * 
 * A HubClient implementation is typically specific to a particular 
 * implementation of Container.
 */

/**
 * Create a new HubClient. All HubClient constructors MUST have this 
 * signature.
 * @constructor
 * 
 * @param {Object} params 
 *    Parameters used to instantiate the HubClient.
 *    Once the constructor is called, the params object belongs to the
 *    HubClient. The caller MUST not modify it.
 *    Implementations of HubClient may specify additional properties
 *    for the params object, besides those identified below. 
 * 
 * @param {Function} params.HubClient.onSecurityAlert
 *     Called when an attempted security breach is thwarted
 * @param {Object} [params.HubClient.scope]
 *     Whenever one of the HubClient's callback functions is called,
 *     references to "this" in the callback will refer to the scope object.
 *     If not provided, the default is window.
 * @param {Function} [params.HubClient.log]
 *     Optional logger function. Would be used to log to console.log or
 *     equivalent. 
 *     
 * @throws {OpenAjax.hub.Error.BadParameters} if any of the required
 *     parameters is missing, or if a parameter value is invalid in 
 *     some way.
 */
//OpenAjax.hub.HubClient = function( params ) {}

/**
 * Requests a connection to the ManagedHub, via the Container
 * associated with this HubClient.
 * 
 * If the Container accepts the connection request, the HubClient's 
 * state is set to CONNECTED and the HubClient invokes the 
 * onComplete callback function.
 * 
 * If the Container refuses the connection request, the HubClient
 * invokes the onComplete callback function with an error code. 
 * The error code might, for example, indicate that the Container 
 * is being destroyed.
 * 
 * In most implementations, this function operates asynchronously, 
 * so the onComplete callback function is the only reliable way to
 * determine when this function completes and whether it has succeeded
 * or failed.
 * 
 * A client application may call HubClient.disconnect and then call
 * HubClient.connect.
 * 
 * @param {Function} [onComplete]
 *     Callback function to call when this operation completes.
 * @param {Object} [scope]  
 *     When the onComplete function is invoked, the JavaScript "this"
 *     keyword refers to this scope object.
 *     If no scope is provided, default is window.
 *
 * @throws {OpenAjax.hub.Error.Duplicate} if the HubClient is already connected
 */
//OpenAjax.hub.HubClient.prototype.connect = function( onComplete, scope ) {}

/**
 * Disconnect from the ManagedHub
 * 
 * Disconnect immediately:
 * 
 * 1. Sets the HubClient's state to DISCONNECTED.
 * 2. Causes the HubClient to send a Disconnect request to the 
 *      associated Container. 
 * 3. Ensures that the client application will receive no more
 *      onData or onComplete callbacks associated with this 
 *      connection, except for the disconnect function's own
 *      onComplete callback.
 * 4. Automatically destroys all of the HubClient's subscriptions.
 *
 * In most implementations, this function operates asynchronously, 
 * so the onComplete callback function is the only reliable way to
 * determine when this function completes and whether it has succeeded
 * or failed.
 * 
 * A client application is allowed to call HubClient.disconnect and 
 * then call HubClient.connect.
 *  
 * @param {Function} [onComplete]
 *     Callback function to call when this operation completes.
 * @param {Object} [scope]  
 *     When the onComplete function is invoked, the JavaScript "this"
 *     keyword refers to the scope object.
 *     If no scope is provided, default is window.
 *
 * @throws {OpenAjax.hub.Error.Disconnected} if the HubClient is already
 *     disconnected
 */
//OpenAjax.hub.HubClient.prototype.disconnect = function( onComplete, scope ) {}

/**
 * If DISCONNECTED: Returns null
 * If CONNECTED: Returns the origin associated with the window containing the
 * Container associated with this HubClient instance. The origin has the format
 *  
 * [protocol]://[host]
 * 
 * where:
 * 
 * [protocol] is "http" or "https"
 * [host] is the hostname of the partner page.
 * 
 * @returns Partner's origin
 * @type {String}
 */
//OpenAjax.hub.HubClient.prototype.getPartnerOrigin = function() {}

/**
 * Returns the client ID of this HubClient
 *
 * @returns clientID
 * @type {String}
 */
//OpenAjax.hub.HubClient.prototype.getClientID = function() {}

////////////////////////////////////////////////////////////////////////////////

/**
 * OpenAjax.hub.ManagedHub
 *
 * Managed hub API for the manager application and for Containers. 
 * 
 * Implements OpenAjax.hub.Hub.
 */

/**
 * Create a new ManagedHub instance
 * @constructor
 *     
 * This constructor automatically sets the ManagedHub's state to
 * CONNECTED.
 * 
 * @param {Object} params
 *     Parameters used to instantiate the ManagedHub.
 *     Once the constructor is called, the params object belongs exclusively to
 *     the ManagedHub. The caller MUST not modify it.
 *     
 * The params object may contain the following properties:
 * 
 * @param {Function} params.onPublish
 *     Callback function that is invoked whenever a 
 *     data value published by a Container is about
 *     to be delivered to some (possibly the same) Container.
 *     This callback function implements a security policy;
 *     it returns true if the delivery of the data is
 *     permitted and false if permission is denied.
 * @param {Function} params.onSubscribe
 *     Called whenever a Container tries to subscribe
 *     on behalf of its client.
 *     This callback function implements a security policy;
 *     it returns true if the subscription is permitted 
 *     and false if permission is denied.
 * @param {Function} [params.onUnsubscribe]
 *     Called whenever a Container unsubscribes on behalf of its client. 
 *     Unlike the other callbacks, onUnsubscribe is intended only for 
 *     informative purposes, and is not used to implement a security
 *     policy.
 * @param {Object} [params.scope]
 *     Whenever one of the ManagedHub's callback functions is called,
 *     references to the JavaScript "this" keyword in the callback 
 *     function refer to this scope object
 *     If no scope is provided, default is window.
 * @param {Function} [params.log]  Optional logger function. Would
 *     be used to log to console.log or equivalent.
 * 
 * @throws {OpenAjax.hub.Error.BadParameters} if any of the required
 *     parameters are missing
 */
OpenAjax.hub.ManagedHub = function( params )
{
    if ( ! params || ! params.onPublish || ! params.onSubscribe )
        throw new Error( OpenAjax.hub.Error.BadParameters );
    
    this._p = params;
    this._onUnsubscribe = params.onUnsubscribe ? params.onUnsubscribe : null;
    this._scope = params.scope || window;

    if ( params.log ) {
        var that = this;
        this._log = function( msg ) {
            try {
                params.log.call( that._scope, "ManagedHub: " + msg );
            } catch( e ) {
                OpenAjax.hub._debugger();
            }
        };
    } else {
        this._log = function() {};
    }

    this._subscriptions = { c:{}, s:null };
    this._containers = {};

    // Sequence # used to create IDs that are unique within this hub
    this._seq = 0;

    this._active = true;
    
    this._isPublishing = false;
    this._pubQ = [];
}

/**
 * Subscribe to a topic on behalf of a Container. Called only by 
 * Container implementations, NOT by manager applications.
 * 
 * This function:
 * 1. Checks with the ManagedHub's onSubscribe security policy
 *    to determine whether this Container is allowed to subscribe 
 *    to this topic.
 * 2. If the subscribe operation is permitted, subscribes to the
 *    topic and returns the ManagedHub's subscription ID for this
 *    subscription. 
 * 3. If the subscribe operation is not permitted, throws
 *    OpenAjax.hub.Error.NotAllowed.
 * 
 * When data is published on the topic, the ManagedHub's 
 * onPublish security policy will be invoked to ensure that
 * this Container is permitted to receive the published data.
 * If the Container is allowed to receive the data, then the
 * Container's sendToClient function will be invoked.
 * 
 * When a Container needs to create a subscription on behalf of
 * its client, the Container MUST use this function to create
 * the subscription.
 * 
 * @param {OpenAjax.hub.Container} container  
 *     A Container
 * @param {String} topic 
 *     A valid topic
 * @param {String} containerSubID  
 *     Arbitrary string ID that the Container uses to 
 *     represent the subscription. Must be unique within the 
 *     context of the Container
 *
 * @returns managerSubID  
 *     Arbitrary string ID that this ManagedHub uses to 
 *     represent the subscription. Will be unique within the 
 *     context of this ManagedHub
 * @type {String}
 * 
 * @throws {OpenAjax.hub.Error.Disconnected} if this.isConnected() returns false
 * @throws {OpenAjax.hub.Error.NotAllowed} if subscription request is denied by the onSubscribe security policy
 * @throws {OpenAjax.hub.Error.BadParameters} if one of the parameters, e.g. the topic, is invalid
 */
OpenAjax.hub.ManagedHub.prototype.subscribeForClient = function( container, topic, containerSubID )
{
    this._assertConn();
    // check subscribe permission
    if ( this._invokeOnSubscribe( topic, container ) ) {
        // return ManagedHub's subscriptionID for this subscription
        return this._subscribe( topic, this._sendToClient, this, { c: container, sid: containerSubID } );
    }
    throw new Error(OpenAjax.hub.Error.NotAllowed);
}

/**
 * Unsubscribe from a subscription on behalf of a Container. Called only by 
 * Container implementations, NOT by manager application code.
 * 
 * This function:
 * 1. Destroys the specified subscription
 * 2. Calls the ManagedHub's onUnsubscribe callback function
 * 
 * This function can be called even if the ManagedHub is not in a CONNECTED state.
 * 
 * @param {OpenAjax.hub.Container} container  
 *    container instance that is unsubscribing
 * @param {String} managerSubID  
 *    opaque ID of a subscription, returned by previous call to subscribeForClient()
 * 
 * @throws {OpenAjax.hub.Error.NoSubscription} if subscriptionID does not refer to a valid subscription
 */
OpenAjax.hub.ManagedHub.prototype.unsubscribeForClient = function( container, managerSubID )
{
    this._unsubscribe( managerSubID );
    this._invokeOnUnsubscribe( container, managerSubID );
}
  
/**
 * Publish data on a topic on behalf of a Container. Called only by 
 * Container implementations, NOT by manager application code.
 *
 * @param {OpenAjax.hub.Container} container
 *      Container on whose behalf data should be published
 * @param {String} topic
 *      Valid topic string. Must NOT contain wildcards.
 * @param {*} data
 *      Valid publishable data. To be portable across different
 *      Container implementations, this value SHOULD be serializable
 *      as JSON.
 * 
 * @throws {OpenAjax.hub.Error.Disconnected} if this.isConnected() returns false
 * @throws {OpenAjax.hub.Error.BadParameters} if one of the parameters, e.g. the topic, is invalid
 */
OpenAjax.hub.ManagedHub.prototype.publishForClient = function( container, topic, data )
{
    this._assertConn();
    this._publish( topic, data, container );
}

/**
 * Destroy this ManagedHub
 * 
 * 1. Sets state to DISCONNECTED. All subsequent attempts to add containers,
 *  publish or subscribe will throw the Disconnected error. We will
 *  continue to allow "cleanup" operations such as removeContainer
 *  and unsubscribe, as well as read-only operations such as 
 *  isConnected
 * 2. Remove all Containers associated with this ManagedHub
 */
OpenAjax.hub.ManagedHub.prototype.disconnect = function()
{
    this._active = false;
    for (var c in this._containers) {
        this.removeContainer( this._containers[c] );
    }
}

/**
 * Get a container belonging to this ManagedHub by its clientID, or null
 * if this ManagedHub has no such container
 * 
 * This function can be called even if the ManagedHub is not in a CONNECTED state.
 * 
 * @param {String} containerId
 *      Arbitrary string ID associated with the container
 *
 * @returns container associated with given ID
 * @type {OpenAjax.hub.Container}
 */
OpenAjax.hub.ManagedHub.prototype.getContainer = function( containerId ) 
{
    var container = this._containers[containerId];
    return container ? container : null;
}

/**
 * Returns an array listing all containers belonging to this ManagedHub.
 * The order of the Containers in this array is arbitrary.
 * 
 * This function can be called even if the ManagedHub is not in a CONNECTED state.
 * 
 * @returns container array
 * @type {OpenAjax.hub.Container[]}
 */
OpenAjax.hub.ManagedHub.prototype.listContainers = function() 
{
    var res = [];
    for (var c in this._containers) { 
        res.push(this._containers[c]);
    }
    return res;
}

/**
 * Add a container to this ManagedHub.
 *
 * This function should only be called by a Container constructor.
 * 
 * @param {OpenAjax.hub.Container} container
 *      A Container to be added to this ManagedHub
 * 
 * @throws {OpenAjax.hub.Error.Duplicate} if there is already a Container
 *      in this ManagedHub whose clientId is the same as that of container
 * @throws {OpenAjax.hub.Error.Disconnected} if this.isConnected() returns false
 */
OpenAjax.hub.ManagedHub.prototype.addContainer = function( container ) 
{ 
    this._assertConn();
    var containerId = container.getClientID();
    if ( this._containers[containerId] ) {
        throw new Error(OpenAjax.hub.Error.Duplicate);
    }
    this._containers[containerId] = container;
}

/**
 * Remove a container from this ManagedHub immediately
 * 
 * This function can be called even if the ManagedHub is not in a CONNECTED state.
 * 
 * @param {OpenAjax.hub.Container} container  
 *      A Container to be removed from this ManagedHub
 *  
 * @throws {OpenAjax.hub.Error.NoContainer}  if no such container is found
 */
OpenAjax.hub.ManagedHub.prototype.removeContainer = function( container )
{
    var containerId = container.getClientID();
    if ( ! this._containers[ containerId ] ) {
        throw new Error(OpenAjax.hub.Error.NoContainer);
    }
    container.remove();
    delete this._containers[ containerId ];
}

    /*** OpenAjax.hub.Hub interface implementation ***/

/**
 * Subscribe to a topic.
 * 
 * This implementation of Hub.subscribe is synchronous. When subscribe 
 * is called:
 * 
 * 1. The ManagedHub's onSubscribe callback is invoked. The 
 *      container parameter is null, because the manager application, 
 *      rather than a container, is subscribing.
 * 2. If onSubscribe returns true, then the subscription is created.
 * 3. The onComplete callback is invoked.
 * 4. Then this function returns.
 * 
 * @param {String} topic
 *     A valid topic string. MAY include wildcards.
 * @param {Function} onData   
 *     Callback function that is invoked whenever an event is 
 *     published on the topic
 * @param {Object} [scope]
 *     When onData callback or onComplete callback is invoked,
 *     the JavaScript "this" keyword refers to this scope object.
 *     If no scope is provided, default is window.
 * @param {Function} [onComplete]
 *     Invoked to tell the client application whether the 
 *     subscribe operation succeeded or failed. 
 * @param {*} [subscriberData]
 *     Client application provides this data, which is handed
 *     back to the client application in the subscriberData
 *     parameter of the onData and onComplete callback functions.
 * 
 * @returns subscriptionID
 *     Identifier representing the subscription. This identifier is an 
 *     arbitrary ID string that is unique within this Hub instance
 * @type {String}
 * 
 * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
 * @throws {OpenAjax.hub.Error.BadParameters} if the topic is invalid (e.g. contains an empty token)
 */
OpenAjax.hub.ManagedHub.prototype.subscribe = function( topic, onData, scope, onComplete, subscriberData ) 
{
    this._assertConn();
    this._assertSubTopic(topic);
    if ( ! onData ) {
        throw new Error( OpenAjax.hub.Error.BadParameters );
    }
    
    scope = scope || window;
    
    // check subscribe permission
    if ( ! this._invokeOnSubscribe( topic, null ) ) {
        this._invokeOnComplete( onComplete, scope, null, false, OpenAjax.hub.Error.NotAllowed );
        return;
    }
    
    // on publish event, check publish permissions
    var that = this;
    function publishCB( topic, data, sd, pcont ) {
        if ( that._invokeOnPublish( topic, data, pcont, null ) ) {
            try {
                onData.call( scope, topic, data, subscriberData );
            } catch( e ) {
                OpenAjax.hub._debugger();
                that._log( "caught error from onData callback to Hub.subscribe(): " + e.message );
            }
        }
    }
    var subID = this._subscribe( topic, publishCB, scope, subscriberData );
    this._invokeOnComplete( onComplete, scope, subID, true );
    return subID;
}

/**
 * Publish an event on a topic
 *
 * This implementation of Hub.publish is synchronous. When publish 
 * is called:
 * 
 * 1. The target subscriptions are identified.
 * 2. For each target subscription, the ManagedHub's onPublish
 *      callback is invoked. Data is only delivered to a target
 *      subscription if the onPublish callback returns true.
 *      The pcont parameter of the onPublish callback is null.
 *      This is because the ManagedHub, rather than a container,
 *      is publishing the data.
 * 
 * @param {String} topic
 *     A valid topic string. MUST NOT include wildcards.
 * @param {*} data
 *     Valid publishable data. To be portable across different
 *     Container implementations, this value SHOULD be serializable
 *     as JSON.
 *     
 * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
 * @throws {OpenAjax.hub.Error.BadParameters} if the topic cannot be published (e.g. contains 
 *     wildcards or empty tokens) or if the data cannot be published (e.g. cannot be serialized as JSON)
 */
OpenAjax.hub.ManagedHub.prototype.publish = function( topic, data ) 
{
    this._assertConn();
    this._assertPubTopic(topic);
    this._publish( topic, data, null );
}

/**
 * Unsubscribe from a subscription
 * 
 * This implementation of Hub.unsubscribe is synchronous. When unsubscribe 
 * is called:
 * 
 * 1. The subscription is destroyed.
 * 2. The ManagedHub's onUnsubscribe callback is invoked, if there is one.
 * 3. The onComplete callback is invoked.
 * 4. Then this function returns.
 * 
 * @param {String} subscriptionID
 *     A subscriptionID returned by Hub.subscribe()
 * @param {Function} [onComplete]
 *     Callback function invoked when unsubscribe completes
 * @param {Object} [scope]
 *     When onComplete callback function is invoked, the JavaScript "this"
 *     keyword refers to this scope object.
 *     If no scope is provided, default is window.
 *     
 * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
 * @throws {OpenAjax.hub.Error.NoSubscription} if no such subscription is found
 */
OpenAjax.hub.ManagedHub.prototype.unsubscribe = function( subscriptionID, onComplete, scope )
{
    this._assertConn();
    if ( ! subscriptionID ) {
        throw new Error( OpenAjax.hub.Error.BadParameters );
    }
    this._unsubscribe( subscriptionID );
    this._invokeOnUnsubscribe( null, subscriptionID );
    this._invokeOnComplete( onComplete, scope, subscriptionID, true );
}

/**
 * Returns true if disconnect() has NOT been called on this ManagedHub, 
 * else returns false
 * 
 * @returns Boolean
 * @type {Boolean}
 */
OpenAjax.hub.ManagedHub.prototype.isConnected = function()
{
    return this._active;
}

/**
* Returns the scope associated with this Hub instance and which will be used
* with callback functions.
* 
* This function can be called even if the Hub is not in a CONNECTED state.
* 
* @returns scope object
* @type {Object}
 */
OpenAjax.hub.ManagedHub.prototype.getScope = function()
{
    return this._scope;
}

/**
 * Returns the subscriberData parameter that was provided when 
 * Hub.subscribe was called.
 *
 * @param subscriberID
 *     The subscriberID of a subscription
 * 
 * @returns subscriberData
 * @type {*}
 * 
 * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
 * @throws {OpenAjax.hub.Error.NoSubscription} if there is no such subscription
 */
OpenAjax.hub.ManagedHub.prototype.getSubscriberData = function( subscriberID )
{
    this._assertConn();
    var path = subscriberID.split(".");
    var sid = path.pop();
    var sub = this._getSubscriptionObject( this._subscriptions, path, 0, sid );
    if ( sub ) 
        return sub.data;
    throw new Error( OpenAjax.hub.Error.NoSubscription );
}

/**
 * Returns the scope associated with a specified subscription.  This scope will
 * be used when invoking the 'onData' callback supplied to Hub.subscribe().
 *
 * @param subscriberID
 *     The subscriberID of a subscription
 * 
 * @returns scope
 * @type {*}
 * 
 * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
 * @throws {OpenAjax.hub.Error.NoSubscription} if there is no such subscription
 */
OpenAjax.hub.ManagedHub.prototype.getSubscriberScope = function( subscriberID )
{
    this._assertConn();
    var path = subscriberID.split(".");
    var sid = path.pop();
    var sub = this._getSubscriptionObject( this._subscriptions, path, 0, sid );
    if ( sub ) 
        return sub.scope;
    throw new Error( OpenAjax.hub.Error.NoSubscription );
}

/**
 * Returns the params object associated with this Hub instance.
 * Allows mix-in code to access parameters passed into constructor that created
 * this Hub instance.
 *
 * @returns params  the params object associated with this Hub instance
 * @type {Object}
 */
OpenAjax.hub.ManagedHub.prototype.getParameters = function()
{
    return this._p;
}


/* PRIVATE FUNCTIONS */

/**
 * Send a message to a container's client. 
 * This is an OAH subscriber's data callback. It is private to ManagedHub
 * and serves as an adapter between the OAH 1.0 API and Container.sendToClient.
 * 
 * @param {String} topic Topic on which data was published
 * @param {Object} data  Data to be delivered to the client
 * @param {Object} sd    Object containing properties 
 *     c: container to which data must be sent
 *     sid: subscription ID within that container
 * @param {Object} pcont  Publishing container, or null if this data was
 *      published by the manager
 */
OpenAjax.hub.ManagedHub.prototype._sendToClient = function(topic, data, sd, pcont) 
{
    if (!this.isConnected()) {
        return;
    }
    if ( this._invokeOnPublish( topic, data, pcont, sd.c ) ) {
        sd.c.sendToClient( topic, data, sd.sid );
    }
}

OpenAjax.hub.ManagedHub.prototype._assertConn = function() 
{
    if (!this.isConnected()) {
        throw new Error(OpenAjax.hub.Error.Disconnected);
    }
}

OpenAjax.hub.ManagedHub.prototype._assertPubTopic = function(topic) 
{
    if ( !topic || topic === "" || (topic.indexOf("*") != -1) ||
        (topic.indexOf("..") != -1) ||  (topic.charAt(0) == ".") ||
        (topic.charAt(topic.length-1) == "."))
    {
        throw new Error(OpenAjax.hub.Error.BadParameters);
    }
}

OpenAjax.hub.ManagedHub.prototype._assertSubTopic = function(topic) 
{
    if ( ! topic ) {
        throw new Error(OpenAjax.hub.Error.BadParameters);
    }
    var path = topic.split(".");
    var len = path.length;
    for (var i = 0; i < len; i++) {
        var p = path[i];
        if ((p === "") ||
           ((p.indexOf("*") != -1) && (p != "*") && (p != "**"))) {
            throw new Error(OpenAjax.hub.Error.BadParameters);
        }
        if ((p == "**") && (i < len - 1)) {
            throw new Error(OpenAjax.hub.Error.BadParameters);
        }
    }
}

OpenAjax.hub.ManagedHub.prototype._invokeOnComplete = function( func, scope, item, success, errorCode )
{
    if ( func ) { // onComplete is optional
        try {
            scope = scope || window;
            func.call( scope, item, success, errorCode );
        } catch( e ) {
            OpenAjax.hub._debugger();
            this._log( "caught error from onComplete callback: " + e.message );
        }
    }
}

OpenAjax.hub.ManagedHub.prototype._invokeOnPublish = function( topic, data, pcont, scont )
{
    try {
        return this._p.onPublish.call( this._scope, topic, data, pcont, scont );
    } catch( e ) {
        OpenAjax.hub._debugger();
        this._log( "caught error from onPublish callback to constructor: " + e.message );
    }
    return false;
}

OpenAjax.hub.ManagedHub.prototype._invokeOnSubscribe = function( topic, container )
{
    try {
        return this._p.onSubscribe.call( this._scope, topic, container );
    } catch( e ) {
        OpenAjax.hub._debugger();
        this._log( "caught error from onSubscribe callback to constructor: " + e.message );
    }
    return false;
}

OpenAjax.hub.ManagedHub.prototype._invokeOnUnsubscribe = function( container, managerSubID )
{
    if ( this._onUnsubscribe ) {
        var topic = managerSubID.slice( 0, managerSubID.lastIndexOf(".") );
        try {
            this._onUnsubscribe.call( this._scope, topic, container );
        } catch( e ) {
            OpenAjax.hub._debugger();
            this._log( "caught error from onUnsubscribe callback to constructor: " + e.message );
        }
    }
}

OpenAjax.hub.ManagedHub.prototype._subscribe = function( topic, onData, scope, subscriberData ) 
{
    var handle = topic + "." + this._seq;
    var sub = { scope: scope, cb: onData, data: subscriberData, sid: this._seq++ };
    var path = topic.split(".");
    this._recursiveSubscribe( this._subscriptions, path, 0, sub );
    return handle;
}

OpenAjax.hub.ManagedHub.prototype._recursiveSubscribe = function(tree, path, index, sub) 
{
    var token = path[index];
    if (index == path.length) {
        sub.next = tree.s;
        tree.s = sub;
    } else { 
        if (typeof tree.c == "undefined") {
             tree.c = {};
         }
        if (typeof tree.c[token] == "undefined") {
            tree.c[token] = { c: {}, s: null }; 
            this._recursiveSubscribe(tree.c[token], path, index + 1, sub);
        } else {
            this._recursiveSubscribe( tree.c[token], path, index + 1, sub);
        }
    }
}

OpenAjax.hub.ManagedHub.prototype._publish = function( topic, data, pcont )
{
    // if we are currently handling a publish event, then queue this request
    // and handle later, one by one
    if ( this._isPublishing ) {
        this._pubQ.push( { t: topic, d: data, p: pcont } );
        return;
    }
    
    this._safePublish( topic, data, pcont );
    
    while ( this._pubQ.length > 0 ) {
        var pub = this._pubQ.shift();
        this._safePublish( pub.t, pub.d, pub.p );
    }
}

OpenAjax.hub.ManagedHub.prototype._safePublish = function( topic, data, pcont )
{
    this._isPublishing = true;
    var path = topic.split(".");
    this._recursivePublish( this._subscriptions, path, 0, topic, data, pcont );
    this._isPublishing = false;
}

OpenAjax.hub.ManagedHub.prototype._recursivePublish = function(tree, path, index, name, msg, pcont) 
{
    if (typeof tree != "undefined") {
        var node;
        if (index == path.length) {
            node = tree;
        } else {
            this._recursivePublish(tree.c[path[index]], path, index + 1, name, msg, pcont);
            this._recursivePublish(tree.c["*"], path, index + 1, name, msg, pcont);
            node = tree.c["**"];
        }
        if (typeof node != "undefined") {
            var sub = node.s;
            while ( sub ) {
                var sc = sub.scope;
                var cb = sub.cb;
                var d = sub.data;
                if (typeof cb == "string") {
                    // get a function object
                    cb = sc[cb];
                }
                cb.call(sc, name, msg, d, pcont);
                sub = sub.next;
            }
        }
    }
}

OpenAjax.hub.ManagedHub.prototype._unsubscribe = function( subscriptionID )
{
    var path = subscriptionID.split(".");
    var sid = path.pop();
    if ( ! this._recursiveUnsubscribe( this._subscriptions, path, 0, sid ) ) {
        throw new Error( OpenAjax.hub.Error.NoSubscription );
    }
}

/**
 * @returns 'true' if properly unsubscribed; 'false' otherwise
 */
OpenAjax.hub.ManagedHub.prototype._recursiveUnsubscribe = function(tree, path, index, sid) 
{
    if ( typeof tree == "undefined" ) {
        return false;
    }
    
    if (index < path.length) {
        var childNode = tree.c[path[index]];
        if ( ! childNode ) {
            return false;
        }
        this._recursiveUnsubscribe(childNode, path, index + 1, sid);
        if ( ! childNode.s ) {
            for (var x in childNode.c) {
                return true;
            }
            delete tree.c[path[index]];    
        }
    } else {
        var sub = tree.s;
        var sub_prev = null;
        var found = false;
        while ( sub ) {
            if ( sid == sub.sid ) {
                found = true;
                if ( sub == tree.s ) {
                    tree.s = sub.next;
                } else {
                    sub_prev.next = sub.next;
                }
                break;
            }
            sub_prev = sub;
            sub = sub.next;
        }
        if ( ! found ) {
            return false;
        }
    }
    
    return true;
}

OpenAjax.hub.ManagedHub.prototype._getSubscriptionObject = function( tree, path, index, sid )
{
    if (typeof tree != "undefined") {
        if (index < path.length) {
            var childNode = tree.c[path[index]];
            return this._getSubscriptionObject(childNode, path, index + 1, sid);
        }

        var sub = tree.s;
        while ( sub ) {
            if ( sid == sub.sid ) {
                return sub;
            }
            sub = sub.next;
        }
    }
    return null;
}


////////////////////////////////////////////////////////////////////////////////

/**
 * Container
 * @constructor
 * 
 * Container represents an instance of a manager-side object that contains and
 * communicates with a single client of the hub. The container might be an inline
 * container, an iframe FIM container, or an iframe PostMessage container, or
 * it might be an instance of some other implementation.
 *
 * @param {OpenAjax.hub.ManagedHub} hub
 *    Managed Hub instance
 * @param {String} clientID
 *    A string ID that identifies a particular client of a Managed Hub. Unique
 *    within the context of the ManagedHub.
 * @param {Object} params  
 *    Parameters used to instantiate the Container.
 *    Once the constructor is called, the params object belongs exclusively to
 *    the Container. The caller MUST not modify it.
 *    Implementations of Container may specify additional properties
 *    for the params object, besides those identified below.
 *    The following params properties MUST be supported by all Container 
 *    implementations:
 * @param {Function} params.Container.onSecurityAlert
 *    Called when an attempted security breach is thwarted.  Function is defined
 *    as follows:  function(container, securityAlert)
 * @param {Function} [params.Container.onConnect]
 *    Called when the client connects to the Managed Hub.  Function is defined
 *    as follows:  function(container)
 * @param {Function} [params.Container.onDisconnect]
 *    Called when the client disconnects from the Managed Hub.  Function is
 *    defined as follows:  function(container)
 * @param {Object} [params.Container.scope]
 *    Whenever one of the Container's callback functions is called, references
 *    to "this" in the callback will refer to the scope object. If no scope is
 *    provided, default is window.
 * @param {Function} [params.Container.log]
 *    Optional logger function. Would be used to log to console.log or
 *    equivalent. 
 *
 * @throws {OpenAjax.hub.Error.BadParameters}   if required params are not
 *   present or null
 * @throws {OpenAjax.hub.Error.Duplicate}   if a Container with this clientID
 *   already exists in the given Managed Hub
 * @throws {OpenAjax.hub.Error.Disconnected}   if ManagedHub is not connected
 */
//OpenAjax.hub.Container = function( hub, clientID, params ) {}

/**
 * Send a message to the client inside this container. This function MUST only
 * be called by ManagedHub. 
 * 
 * @param {String} topic
 *    The topic name for the published message
 * @param {*} data
 *    The payload. Can be any JSON-serializable value.
 * @param {String} containerSubscriptionId
 *    Container's ID for a subscription, from previous call to
 *    subscribeForClient()
 */
//OpenAjax.hub.Container.prototype.sendToClient = function( topic, data, containerSubscriptionId ) {}

/**
 * Shut down a container. remove does all of the following:
 * - disconnects container from HubClient
 * - unsubscribes from all of its existing subscriptions in the ManagedHub
 * 
 * This function is only called by ManagedHub.removeContainer
 * Calling this function does NOT cause the container's onDisconnect callback to
 * be invoked.
 */
//OpenAjax.hub.Container.prototype.remove = function() {}

/**
 * Returns true if the given client is connected to the managed hub.
 * Else returns false.
 *
 * @returns true if the client is connected to the managed hub
 * @type boolean
 */
//OpenAjax.hub.Container.prototype.isConnected = function() {}

/**
 * Returns the clientID passed in when this Container was instantiated.
 *
 * @returns The clientID
 * @type {String}  
 */
//OpenAjax.hub.Container.prototype.getClientID = function() {}

/**
 * If DISCONNECTED:
 * Returns null
 * If CONNECTED:
 * Returns the origin associated with the window containing the HubClient
 * associated with this Container instance. The origin has the format
 *  
 * [protocol]://[host]
 * 
 * where:
 * 
 * [protocol] is "http" or "https"
 * [host] is the hostname of the partner page.
 * 
 * @returns Partner's origin
 * @type {String}
 */
//OpenAjax.hub.Container.prototype.getPartnerOrigin = function() {}

/**
 * Returns the params object associated with this Container instance.
 *
 * @returns params
 *    The params object associated with this Container instance
 * @type {Object}
 */
//OpenAjax.hub.Container.prototype.getParameters = function() {}

/**
 * Returns the ManagedHub to which this Container belongs.
 *
 * @returns ManagedHub
 *         The ManagedHub object associated with this Container instance
 * @type {OpenAjax.hub.ManagedHub}
 */
//OpenAjax.hub.Container.prototype.getHub = function() {}

////////////////////////////////////////////////////////////////////////////////

/*
 * Unmanaged Hub
 */

/**
 * OpenAjax.hub._hub is the default ManagedHub instance that we use to 
 * provide OAH 1.0 behavior. 
 */
OpenAjax.hub._hub = new OpenAjax.hub.ManagedHub({ 
    onSubscribe: function(topic, ctnr) { return true; },
    onPublish: function(topic, data, pcont, scont) { return true; }
});

/**
 * Subscribe to a topic.
 *
 * @param {String} topic
 *     A valid topic string. MAY include wildcards.
 * @param {Function|String} onData
 *     Callback function that is invoked whenever an event is published on the
 *     topic.  If 'onData' is a string, then it represents the name of a
 *     function on the 'scope' object.
 * @param {Object} [scope]
 *     When onData callback is invoked,
 *     the JavaScript "this" keyword refers to this scope object.
 *     If no scope is provided, default is window.
 * @param {*} [subscriberData]
 *     Client application provides this data, which is handed
 *     back to the client application in the subscriberData
 *     parameter of the onData callback function.
 * 
 * @returns {String} Identifier representing the subscription.
 * 
 * @throws {OpenAjax.hub.Error.BadParameters} if the topic is invalid
 *     (e.g.contains an empty token)
 */
OpenAjax.hub.subscribe = function(topic, onData, scope, subscriberData) 
{
    // resolve the 'onData' function if it is a string
    if ( typeof onData === "string" ) {
        scope = scope || window;
        onData = scope[ onData ] || null;
    }
    
    return OpenAjax.hub._hub.subscribe( topic, onData, scope, null, subscriberData );
}

/**
 * Unsubscribe from a subscription.
 *
 * @param {String} subscriptionID
 *     Subscription identifier returned by subscribe()
 *     
 * @throws {OpenAjax.hub.Error.NoSubscription} if no such subscription is found
 */
OpenAjax.hub.unsubscribe = function(subscriptionID) 
{
    return OpenAjax.hub._hub.unsubscribe( subscriptionID );
}

/**
 * Publish an event on a topic.
 *
 * @param {String} topic
 *     A valid topic string. MUST NOT include wildcards.
 * @param {*} data
 *     Valid publishable data.
 *     
 * @throws {OpenAjax.hub.Error.BadParameters} if the topic cannot be published
 *     (e.g. contains wildcards or empty tokens)
 */
OpenAjax.hub.publish = function(topic, data) 
{
    OpenAjax.hub._hub.publish(topic, data);
}

////////////////////////////////////////////////////////////////////////////////

// Register the OpenAjax Hub itself as a library.
OpenAjax.hub.registerLibrary("OpenAjax", "http://openajax.org/hub", "2.0", {});

} // !OpenAjax.hub

return OpenAjax;

});
/*

        Copyright 2006-2009 OpenAjax Alliance

        Licensed under the Apache License, Version 2.0 (the "License"); 
        you may not use this file except in compliance with the License. 
        You may obtain a copy of the License at
        
                http://www.apache.org/licenses/LICENSE-2.0

        Unless required by applicable law or agreed to in writing, software 
        distributed under the License is distributed on an "AS IS" BASIS, 
        WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. 
        See the License for the specific language governing permissions and 
        limitations under the License.
*/

define('OpenAjax/containers/inline/inline',['OpenAjax/hub/hub'], function( OpenAjax ){



/**
 * Create a new Inline Container.
 * @constructor
 * @extends OpenAjax.hub.Container
 *
 * InlineContainer implements the Container interface to provide a container
 * that places components within the same browser frame as the main mashup
 * application. As such, this container does not isolate client components into
 * secure sandboxes.
 * 
 * @param {OpenAjax.hub.ManagedHub} hub
 *    Managed Hub instance to which this Container belongs
 * @param {String} clientID
 *    A string ID that identifies a particular client of a Managed Hub. Unique
 *    within the context of the ManagedHub.
 * @param {Object} params  
 *    Parameters used to instantiate the InlineContainer.
 *    Once the constructor is called, the params object belongs exclusively to
 *    the InlineContainer. The caller MUST not modify it.
 *    The following are the pre-defined properties on params:
 * @param {Function} params.Container.onSecurityAlert
 *    Called when an attempted security breach is thwarted.  Function is defined
 *    as follows:  function(container, securityAlert)
 * @param {Function} [params.Container.onConnect]
 *    Called when the client connects to the Managed Hub.  Function is defined
 *    as follows:  function(container)
 * @param {Function} [params.Container.onDisconnect]
 *    Called when the client disconnects from the Managed Hub.  Function is
 *    defined as follows:  function(container)
 * @param {Object} [params.Container.scope]
 *    Whenever one of the Container's callback functions is called, references
 *    to "this" in the callback will refer to the scope object. If no scope is
 *    provided, default is window.
 * @param {Function} [params.Container.log]
 *    Optional logger function. Would be used to log to console.log or
 *    equivalent. 
 *
 * @throws {OpenAjax.hub.Error.BadParameters}   if required params are not
 *    present or null
 * @throws {OpenAjax.hub.Error.Duplicate}   if a Container with this clientID
 *    already exists in the given Managed Hub
 * @throws {OpenAjax.hub.Error.Disconnected}   if ManagedHub is not connected
 */
OpenAjax.hub.InlineContainer = function( hub, clientID, params )
{
    if ( ! hub || ! clientID || ! params ||
            ! params.Container || ! params.Container.onSecurityAlert ) {
        throw new Error(OpenAjax.hub.Error.BadParameters);
    }
    
    var cbScope = params.Container.scope || window;
    var connected = false;
    var subs = [];
    var subIndex = 0;
    var client = null;
    
    if ( params.Container.log ) {
        var log = function( msg ) {
            try {
                params.Container.log.call( cbScope, "InlineContainer::" + clientID + ": " + msg );
            } catch( e ) {
                OpenAjax.hub._debugger();
            }
        };
    } else {
        log = function() {};
    }
    
    this._init = function() {
        hub.addContainer( this );
    };

  /*** OpenAjax.hub.Container interface implementation ***/
    
    this.getHub = function() {
    	return hub;
    };
    
    this.sendToClient = function( topic, data, subscriptionID ) {
        if ( connected ) {
            var sub = subs[ subscriptionID ];
            try {
                sub.cb.call( sub.sc, topic, data, sub.d );
            } catch( e ) {
                OpenAjax.hub._debugger();
                client._log( "caught error from onData callback to HubClient.subscribe(): " + e.message );
            }
        }
    };
    
    this.remove = function() {
        if ( connected ) {
            finishDisconnect();
        }
    };
    
    this.isConnected = function() {
        return connected;
    };
    
    this.getClientID = function() {
        return clientID;
    };
    
    this.getPartnerOrigin = function() {
        if ( connected ) {
            return window.location.protocol + "//" + window.location.hostname;
        }
        return null;
    };
    
    this.getParameters = function() {
        return params;
    };
    
  /*** OpenAjax.hub.HubClient interface implementation ***/
    
    this.connect = function( hubClient, onComplete, scope ) {
        if ( connected ) {
            throw new Error( OpenAjax.hub.Error.Duplicate );
        }
        
        connected = true;
        client = hubClient;
        
        if ( params.Container.onConnect ) {
            try {
                params.Container.onConnect.call( cbScope, this );
            } catch( e ) {
                OpenAjax.hub._debugger();
                log( "caught error from onConnect callback to constructor: " + e.message );
            }
        }
        
        invokeOnComplete( onComplete, scope, hubClient, true );
    };
    
    this.disconnect = function( hubClient, onComplete, scope ) {
        if ( ! connected ) {
            throw new Error( OpenAjax.hub.Error.Disconnected );
        }
        
        finishDisconnect();
    
        if ( params.Container.onDisconnect ) {
            try {
                params.Container.onDisconnect.call( cbScope, this );
            } catch( e ) {
                OpenAjax.hub._debugger();
                log( "caught error from onDisconnect callback to constructor: " + e.message );
            }
        }
        
        invokeOnComplete( onComplete, scope, hubClient, true );
    };
    
  /*** OpenAjax.hub.Hub interface implementation ***/
    
    this.subscribe = function( topic, onData, scope, onComplete, subscriberData ) {
        assertConn();
        assertSubTopic( topic );
        if ( ! onData ) {
            throw new Error( OpenAjax.hub.Error.BadParameters );
        }
        
        var subID = "" + subIndex++;
        var success = false;
        var msg = null;
        try {
            var handle = hub.subscribeForClient( this, topic, subID );
            success = true;
        } catch( e ) {
            // failure
            subID = null;
            msg = e.message;
        }
        
        scope = scope || window;
        if ( success ) {
            subs[ subID ] = { h: handle, cb: onData, sc: scope, d: subscriberData };
        }
        
        invokeOnComplete( onComplete, scope, subID, success, msg );
        return subID;
    };
    
    this.publish = function( topic, data ) {
        assertConn();
        assertPubTopic( topic );
        hub.publishForClient( this, topic, data );
    };
    
    this.unsubscribe = function( subscriptionID, onComplete, scope ) {
        assertConn();
        if ( typeof subscriptionID === "undefined" || subscriptionID === null ) {
            throw new Error( OpenAjax.hub.Error.BadParameters );
        }
        var sub = subs[ subscriptionID ];
        if ( ! sub ) { 
            throw new Error( OpenAjax.hub.Error.NoSubscription );
        }    
        hub.unsubscribeForClient( this, sub.h );
        delete subs[ subscriptionID ];
        
        invokeOnComplete( onComplete, scope, subscriptionID, true );
    };
    
    this.getSubscriberData = function( subID ) {
        assertConn();
        return getSubscription( subID ).d;
    };
    
    this.getSubscriberScope = function( subID ) {
        assertConn();
        return getSubscription( subID ).sc;
    };
    
  /*** PRIVATE FUNCTIONS ***/
    
    function invokeOnComplete( func, scope, item, success, errorCode ) {
        if ( func ) { // onComplete is optional
            try {
                scope = scope || window;
                func.call( scope, item, success, errorCode );
            } catch( e ) {
                OpenAjax.hub._debugger();
                // invokeOnComplete is only called for client interfaces (Hub and HubClient)
                client._log( "caught error from onComplete callback: " + e.message );
            }
        }
    }
    
    function finishDisconnect() {
        for ( var subID in subs ) {
            hub.unsubscribeForClient( this, subs[subID].h );
        }
        subs = [];
        subIndex = 0;
        connected = false;
    }
    
    function assertConn() {
        if ( ! connected ) {
            throw new Error( OpenAjax.hub.Error.Disconnected );
        }
    }
    
    function assertPubTopic( topic ) {
        if ((topic == null) || (topic === "") || (topic.indexOf("*") != -1) ||
            (topic.indexOf("..") != -1) ||  (topic.charAt(0) == ".") ||
            (topic.charAt(topic.length-1) == "."))
        {
            throw new Error(OpenAjax.hub.Error.BadParameters);
        }
    }
    
    function assertSubTopic( topic ) {
        if ( ! topic ) {
            throw new Error(OpenAjax.hub.Error.BadParameters);
        }
        var path = topic.split(".");
        var len = path.length;
        for (var i = 0; i < len; i++) {
            var p = path[i];
            if ((p === "") ||
               ((p.indexOf("*") != -1) && (p != "*") && (p != "**"))) {
                throw new Error(OpenAjax.hub.Error.BadParameters);
            }
            if ((p == "**") && (i < len - 1)) {
                throw new Error(OpenAjax.hub.Error.BadParameters);
            }
        }
    }
    
    function getSubscription( subID ) {
        var sub = subs[ subID ];
        if ( sub ) {
            return sub;
        }
        throw new Error( OpenAjax.hub.Error.NoSubscription );
    }
    
    
    this._init();
};

////////////////////////////////////////////////////////////////////////////////

/**
 * Create a new InlineHubClient.
 * @constructor
 * @extends OpenAjax.hub.HubClient
 * 
 * @param {Object} params 
 *    Parameters used to instantiate the HubClient.
 *    Once the constructor is called, the params object belongs to the
 *    HubClient. The caller MUST not modify it.
 *    The following are the pre-defined properties on params:
 * @param {Function} params.HubClient.onSecurityAlert
 *     Called when an attempted security breach is thwarted
 * @param {Object} [params.HubClient.scope]
 *     Whenever one of the HubClient's callback functions is called,
 *     references to "this" in the callback will refer to the scope object.
 *     If not provided, the default is window.
 * @param {Function} [params.HubClient.log]
 *     Optional logger function. Would be used to log to console.log or
 *     equivalent. 
 * @param {OpenAjax.hub.InlineContainer} params.InlineHubClient.container
 *     Specifies the InlineContainer to which this HubClient will connect
 *  
 * @throws {OpenAjax.hub.Error.BadParameters} if any of the required
 *     parameters are missing
 */
OpenAjax.hub.InlineHubClient = function( params )
{
    if ( ! params || ! params.HubClient || ! params.HubClient.onSecurityAlert ||
            ! params.InlineHubClient || ! params.InlineHubClient.container ) {
        throw new Error(OpenAjax.hub.Error.BadParameters);
    }
    
    var container = params.InlineHubClient.container;
    var scope = params.HubClient.scope || window;
    
    if ( params.HubClient.log ) {
        var log = function( msg ) {
            try {
                params.HubClient.log.call( scope, "InlineHubClient::" + container.getClientID() + ": " + msg );
            } catch( e ) {
                OpenAjax.hub._debugger();
            }
        };
    } else {
        log = function() {};
    }
    this._log = log;

  /*** OpenAjax.hub.HubClient interface implementation ***/
    
    /**
     * Requests a connection to the ManagedHub, via the InlineContainer
     * associated with this InlineHubClient.
     * 
     * If the Container accepts the connection request, this HubClient's 
     * state is set to CONNECTED and the HubClient invokes the 
     * onComplete callback function.
     * 
     * If the Container refuses the connection request, the HubClient
     * invokes the onComplete callback function with an error code. 
     * The error code might, for example, indicate that the Container 
     * is being destroyed.
     * 
     * If the HubClient is already connected, calling connect will cause
     * the HubClient to immediately invoke the onComplete callback with
     * the error code OpenAjax.hub.Error.Duplicate.
     * 
     * @param {Function} [onComplete]
     *     Callback function to call when this operation completes.
     * @param {Object} [scope]  
     *     When the onComplete function is invoked, the JavaScript "this"
     *     keyword refers to this scope object.
     *     If no scope is provided, default is window.
     *    
     * In this implementation of InlineHubClient, this function operates 
     * SYNCHRONOUSLY, so the onComplete callback function is invoked before 
     * this connect function returns. Developers are cautioned that in  
     * IframeHubClient implementations, this is not the case.
     * 
     * A client application may call InlineHubClient.disconnect and then call
     * InlineHubClient.connect to reconnect to the Managed Hub.
     */
    this.connect = function( onComplete, scope ) {
        container.connect( this, onComplete, scope );
    };
    
    /**
     * Disconnect from the ManagedHub
     * 
     * Disconnect immediately:
     * 
     * 1. Sets the HubClient's state to DISCONNECTED.
     * 2. Causes the HubClient to send a Disconnect request to the 
     * 		associated Container. 
     * 3. Ensures that the client application will receive no more
     * 		onData or onComplete callbacks associated with this 
     * 		connection, except for the disconnect function's own
     * 		onComplete callback.
     * 4. Automatically destroys all of the HubClient's subscriptions.
     * 	
     * @param {Function} [onComplete]
     *     Callback function to call when this operation completes.
     * @param {Object} [scope]  
     *     When the onComplete function is invoked, the JavaScript "this"
     *     keyword refers to the scope object.
     *     If no scope is provided, default is window.
     *    
     * In this implementation of InlineHubClient, the disconnect function operates 
     * SYNCHRONOUSLY, so the onComplete callback function is invoked before 
     * this function returns. Developers are cautioned that in IframeHubClient 
     * implementations, this is not the case.   
     * 
     * A client application is allowed to call HubClient.disconnect and 
     * then call HubClient.connect in order to reconnect.
     */
    this.disconnect = function( onComplete, scope ) {
        container.disconnect( this, onComplete, scope );
    };
    
    this.getPartnerOrigin = function() {
        return container.getPartnerOrigin();
    };
    
    this.getClientID = function() {
        return container.getClientID();
    };
    
  /*** OpenAjax.hub.Hub interface implementation ***/
    
    /**
     * Subscribe to a topic.
     *
     * @param {String} topic
     *     A valid topic string. MAY include wildcards.
     * @param {Function} onData   
     *     Callback function that is invoked whenever an event is 
     *     published on the topic
     * @param {Object} [scope]
     *     When onData callback or onComplete callback is invoked,
     *     the JavaScript "this" keyword refers to this scope object.
     *     If no scope is provided, default is window.
     * @param {Function} [onComplete]
     *     Invoked to tell the client application whether the 
     *     subscribe operation succeeded or failed. 
     * @param {*} [subscriberData]
     *     Client application provides this data, which is handed
     *     back to the client application in the subscriberData
     *     parameter of the onData and onComplete callback functions.
     * 
     * @returns subscriptionID
     *     Identifier representing the subscription. This identifier is an 
     *     arbitrary ID string that is unique within this Hub instance
     * @type {String}
     * 
     * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance is not in CONNECTED state
     * @throws {OpenAjax.hub.Error.BadParameters} if the topic is invalid (e.g. contains an empty token)
     *
     * In this implementation of InlineHubClient, the subscribe function operates 
     * Thus, onComplete is invoked before this function returns. Developers are 
     * cautioned that in most implementations of HubClient, onComplete is invoked 
     * after this function returns.
     * 
     * If unsubscribe is called before subscribe completes, the subscription is 
     * immediately terminated, and onComplete is never invoked.
     */
    this.subscribe = function( topic, onData, scope, onComplete, subscriberData ) {
        return container.subscribe( topic, onData, scope, onComplete, subscriberData );
    };
    
    /**
     * Publish an event on 'topic' with the given data.
     *
     * @param {String} topic
     *     A valid topic string. MUST NOT include wildcards.
     * @param {*} data
     *     Valid publishable data. To be portable across different
     *     Container implementations, this value SHOULD be serializable
     *     as JSON.
     *     
     * @throws {OpenAjax.hub.Error.Disconnected} if this Hub instance 
     *     is not in CONNECTED state
     * 
     * In this implementation, publish operates SYNCHRONOUSLY. 
     * Data will be delivered to subscribers after this function returns.
     * In most implementations, publish operates synchronously, 
     * delivering its data to the clients before this function returns.
     */
    this.publish = function( topic, data ) {
        container.publish( topic, data );
    };
    
    /**
     * Unsubscribe from a subscription
     *
     * @param {String} subscriptionID
     *     A subscriptionID returned by InlineHubClient.prototype.subscribe()
     * @param {Function} [onComplete]
     *     Callback function invoked when unsubscribe completes
     * @param {Object} [scope]
     *     When onComplete callback function is invoked, the JavaScript "this"
     *     keyword refers to this scope object.
     *     
     * @throws {OpenAjax.hub.Error.NoSubscription} if no such subscription is found
     * 
     * To facilitate cleanup, it is possible to call unsubscribe even 
     * when the HubClient is in a DISCONNECTED state.
     * 
     * In this implementation of HubClient, this function operates SYNCHRONOUSLY. 
     * Thus, onComplete is invoked before this function returns. Developers are 
     * cautioned that in most implementations of HubClient, onComplete is invoked 
     * after this function returns.
     */
    this.unsubscribe = function( subscriptionID, onComplete, scope ) {
        container.unsubscribe( subscriptionID, onComplete, scope );
    };
    
    this.isConnected = function() {
        return container.isConnected();
    };
    
    this.getScope = function() {
        return scope;
    };
    
    this.getSubscriberData = function( subID ) {
        return container.getSubscriberData( subID );
    };
    
    this.getSubscriberScope = function( subID ) {
        return container.getSubscriberScope( subID );
    };
    
    /**
     * Returns the params object associated with this Hub instance.
     * Allows mix-in code to access parameters passed into constructor that created
     * this Hub instance.
     *
     * @returns params  the params object associated with this Hub instance
     * @type {Object}
     */
    this.getParameters = function() {
        return params;
    };
};

return OpenAjax;
});
/*

        Copyright 2006-2009 OpenAjax Alliance

        Licensed under the Apache License, Version 2.0 (the "License"); 
        you may not use this file except in compliance with the License. 
        You may obtain a copy of the License at
        
                http://www.apache.org/licenses/LICENSE-2.0

        Unless required by applicable law or agreed to in writing, software 
        distributed under the License is distributed on an "AS IS" BASIS, 
        WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. 
        See the License for the specific language governing permissions and 
        limitations under the License.
*/

define('OpenAjax/containers/iframe/iframe',[ 'OpenAjax/hub/hub'], function( OpenAjax ){

var OpenAjax = OpenAjax || {};
OpenAjax.hub = OpenAjax.hub || {};
OpenAjax.gadgets = typeof OpenAjax.gadgets === 'object' ? OpenAjax.gadgets :
                   typeof gadgets === 'object' ? gadgets :
                   {};
OpenAjax.gadgets.rpctx = OpenAjax.gadgets.rpctx || {};

(function() {
    // For now, we only use "oaaConfig" for the global "gadgets" object.  If the "gadgets" global
    // already exists, then there is no reason to check for "oaaConfig".  In the future, if we use
    // "oaaConfig" for other purposes, we'll need to remove the check for "!window.gadgets".
    if (typeof gadgets === 'undefined') {
        // "oaaConfig" can be specified as a global object.  If not found, then look for it as an
        // attribute on the script line for the OpenAjax Hub JS file.
        if (typeof oaaConfig === 'undefined') {
            var scripts = document.getElementsByTagName("script");
            // match "OpenAjax-mashup.js", "OpenAjaxManagedHub-all*.js", "OpenAjaxManagedHub-core*.js"
            var reHub = /openajax(?:managedhub-(?:all|core).*|-mashup)\.js$/i;
            for ( var i = scripts.length - 1; i >= 0; i-- ) {
                var src = scripts[i].getAttribute( "src" );
                if ( !src ) {
                    continue;
                }
                
                var m = src.match( reHub );
                if ( m ) {
                    var config = scripts[i].getAttribute( "oaaConfig" );
                    if ( config ) {
                        try {
                            oaaConfig = eval( "({ " + config + " })" );
                        } catch (e) {}
                    }
                    break;
                }
            }
        }
        
        if (typeof oaaConfig !== 'undefined' && oaaConfig.gadgetsGlobal) {
            gadgets = OpenAjax.gadgets;
        }
    }
})();


if (!OpenAjax.hub.IframeContainer) {

(function(){

/**
 * Create a new Iframe Container.
 * @constructor
 * @extends OpenAjax.hub.Container
 * 
 * IframeContainer implements the Container interface to provide a container
 * that isolates client components into secure sandboxes by leveraging the
 * isolation features provided by browser iframes.
 * 
 * SECURITY
 * 
 * In order for the connection between the IframeContainer and IframeHubClient
 * to be fully secure, you must specify a valid 'tunnelURI'. Note that if you
 * do specify a 'tunnelURI', then only the WPM and NIX transports are used,
 * covering the following browsers:
 *   IE 6+, Firefox 3+, Safari 4+, Chrome 2+, Opera 9+.
 * 
 * If no 'tunnelURI' is specified, then some security features are disabled:
 * the IframeContainer will not report FramePhish errors, and on some browsers
 * IframeContainer and IframeHubClient will not be able to validate the
 * identity of their partner (i.e. getPartnerOrigin() will return 'null').
 * However, not providing 'tunnelURI' allows the additional use of the RMR
 * and FE transports -- in addition to the above browsers, the Hub code will
 * also work on:
 *   Firefox 1 & 2, Safari 2 & 3, Chrome 1.
 * 
 * @param {OpenAjax.hub.ManagedHub} hub
 *    Managed Hub instance to which this Container belongs
 * @param {String} clientID
 *    A string ID that identifies a particular client of a Managed Hub. Unique
 *    within the context of the ManagedHub.
 * @param {Object} params  
 *    Parameters used to instantiate the IframeContainer.
 *    Once the constructor is called, the params object belongs exclusively to
 *    the IframeContainer. The caller MUST not modify it.
 *    The following are the pre-defined properties on params:
 * @param {Function} params.Container.onSecurityAlert
 *    Called when an attempted security breach is thwarted.  Function is defined
 *    as follows:  function(container, securityAlert)
 * @param {Function} [params.Container.onConnect]
 *    Called when the client connects to the Managed Hub.  Function is defined
 *    as follows:  function(container)
 * @param {Function} [params.Container.onDisconnect]
 *    Called when the client disconnects from the Managed Hub.  Function is
 *    defined as follows:  function(container)
 * @param {Object} [params.Container.scope]
 *    Whenever one of the Container's callback functions is called, references
 *    to "this" in the callback will refer to the scope object. If no scope is
 *    provided, default is window.
 * @param {Function} [params.Container.log]
 *    Optional logger function. Would be used to log to console.log or
 *    equivalent. 
 * @param {Object} params.IframeContainer.parent
 *    DOM element that is to be parent of iframe
 * @param {String} params.IframeContainer.uri
 *    Initial Iframe URI (Container will add parameters to this URI)
 * @param {String} [params.IframeContainer.clientRelay]
 *    URI of the relay file used by the client.  Must be from the same origin
 *    as params.IframeContainer.uri.  This value is only used by the IFPC
 *    transport layer, which is primarily used by IE 6 & 7. This value isn't
 *    required if you don't need to support those browsers.
 * @param {String} [params.IframeContainer.tunnelURI]
 *    URI of the tunnel iframe. Must be from the same origin as the page which
 *    instantiates the IframeContainer. If not specified, connection will not
 *    be fully secure (see SECURITY section).
 * @param {Object} [params.IframeContainer.iframeAttrs]
 *    Attributes to add to IFRAME DOM entity.  For example:
 *              { style: { width: "100%",
 *                         height: "100%" },
 *                className: "some_class" }
 * @param {Number} [params.IframeContainer.timeout]
 *    Load timeout in milliseconds.  If not specified, defaults to 15000.  If
 *    the client at params.IframeContainer.uri does not establish a connection
 *    with this container in the given time, the onSecurityAlert callback is
 *    called with a LoadTimeout error code.
 * @param {Function} [params.IframeContainer.seed]
 *    A function that returns a string that will be used to seed the
 *    pseudo-random number generator, which is used to create the security
 *    tokens.  An implementation of IframeContainer may choose to ignore this
 *    value.
 * @param {Number} [params.IframeContainer.tokenLength]
 *    Length of the security tokens used when transmitting messages.  If not
 *    specified, defaults to 6.  An implementation of IframeContainer may choose
 *    to ignore this value.
 *
 * @throws {OpenAjax.hub.Error.BadParameters}   if required params are not
 *          present or null
 * @throws {OpenAjax.hub.Error.Duplicate}   if a Container with this clientID
 *          already exists in the given Managed Hub
 * @throws {OpenAjax.hub.Error.Disconnected}   if hub is not connected
 */
OpenAjax.hub.IframeContainer = function( hub, clientID, params )
{
    assertValidParams( arguments );
    
    var container = this;
    var scope = params.Container.scope || window;
    var connected = false;
    var subs = {};
    var securityToken;
    var internalID;
    var timeout = params.IframeContainer.timeout || 15000;
    var loadTimer;

    if ( params.Container.log ) {
        var log = function( msg ) {
            try {
                params.Container.log.call( scope, "IframeContainer::" + clientID + ": " + msg );
            } catch( e ) {
                OpenAjax.hub._debugger();
            }
        };
    } else {
        log = function() {};
    }
    
    
    this._init = function() {
        // add to ManagedHub first, to see if clientID is a duplicate
        hub.addContainer( this );
        
        // Create an "internal" ID, which is guaranteed to be unique within the
        // window, not just within the hub.
        internalID = OpenAjax.hub.IframeContainer._rpcRouter.add( clientID, this );
        securityToken = generateSecurityToken( params, scope, log );
        
        var relay = params.IframeContainer.clientRelay;
        var transportName = OpenAjax.gadgets.rpc.getRelayChannel();
        if ( params.IframeContainer.tunnelURI ) {
            if ( transportName !== "wpm" && transportName !== "ifpc" ) {
                throw new Error( OpenAjax.hub.Error.IncompatBrowser );
            }
        } else {
            log( "WARNING: Parameter 'IframeContaienr.tunnelURI' not specified. Connection will not be fully secure." );
            if ( transportName === "rmr" && !relay ) {
                relay = OpenAjax.gadgets.rpc.getOrigin( params.IframeContainer.uri ) + "/robots.txt"; 
            }
        }
        
        // Create IFRAME to hold the client
        createIframe();
        
        OpenAjax.gadgets.rpc.setupReceiver( internalID, relay );
        
        startLoadTimer();
    };

        
  /*** OpenAjax.hub.Container interface ***/
   
    this.sendToClient = function( topic, data, subscriptionID ) {
        OpenAjax.gadgets.rpc.call( internalID, "openajax.pubsub", null, "pub", topic, data,
                                   subscriptionID );
    };

    this.remove = function() {
        finishDisconnect();
        clearTimeout( loadTimer );
        OpenAjax.gadgets.rpc.removeReceiver( internalID );
        var iframe = document.getElementById( internalID );
        iframe.parentNode.removeChild( iframe );
        OpenAjax.hub.IframeContainer._rpcRouter.remove( internalID );
    };

    this.isConnected = function() {
        return connected;
    };
    
    this.getClientID = function() {
        return clientID;
    };

    this.getPartnerOrigin = function() {
        if ( connected ) {
            var origin = OpenAjax.gadgets.rpc.getReceiverOrigin( internalID );
            if ( origin ) {
                // remove port if present
                return ( /^([a-zA-Z]+:\/\/[^:]+).*/.exec( origin )[1] );
            }
        }
        return null;
    };
    
    this.getParameters = function() {
        return params;
    };
    
    this.getHub = function() {
        return hub;
    };
    
    
  /*** OpenAjax.hub.IframeContainer interface ***/
    
    /**
     * Get the iframe associated with this iframe container
     * 
     * This function returns the iframe associated with an IframeContainer,
     * allowing the Manager Application to change its size, styles, scrollbars, etc.
     * 
     * CAUTION: The iframe is owned exclusively by the IframeContainer. The Manager
     * Application MUST NOT destroy the iframe directly. Also, if the iframe is
     * hidden and disconnected, the Manager Application SHOULD NOT attempt to make
     * it visible. The Container SHOULD automatically hide the iframe when it is
     * disconnected; to make it visible would introduce security risks. 
     * 
     * @returns iframeElement
     * @type {Object}
     */
    this.getIframe = function() {
        return document.getElementById( internalID );
    };
    
    
  /*** private functions ***/

    function assertValidParams( args ) {
        var hub = args[0],
            clientID = args[1],
            params = args[2];
        if ( ! hub || ! clientID || ! params || ! params.Container ||
             ! params.Container.onSecurityAlert || ! params.IframeContainer ||
             ! params.IframeContainer.parent || ! params.IframeContainer.uri ) {
            throw new Error( OpenAjax.hub.Error.BadParameters );
        }
    }
    
    this._handleIncomingRPC = function( command, topic, data ) {
        switch ( command ) {
            // publish
            // 'data' is topic message
            case "pub":
                hub.publishForClient( container, topic, data );
                break;
            
            // subscribe
            // 'data' is subscription ID
            case "sub":
                var errCode = "";  // empty string is success
                try {
                    subs[ data ] = hub.subscribeForClient( container, topic, data );
                } catch( e ) {
                    errCode = e.message;
                }
                return errCode;
            
            // unsubscribe
            // 'data' is subscription ID
            case "uns":
                var handle = subs[ data ];
                hub.unsubscribeForClient( container, handle );
                delete subs[ data ];
                return data;
            
            // connect
            case "con":
                finishConnect();
                return true;
            
            // disconnect
            case "dis":
                startLoadTimer();
                finishDisconnect();
                if ( params.Container.onDisconnect ) {
                    try {
                        params.Container.onDisconnect.call( scope, container );
                    } catch( e ) {
                        OpenAjax.hub._debugger();
                        log( "caught error from onDisconnect callback to constructor: " + e.message );
                    }
                }
                return true;
        }
    };
    
    this._onSecurityAlert = function( error ) {
        invokeSecurityAlert( rpcErrorsToOAA[ error ] );
    };
    
    // The RPC code requires that the 'name' attribute be properly set on the
    // iframe.  However, setting the 'name' property on the iframe object
    // returned from 'createElement("iframe")' doesn't work on IE --
    // 'window.name' returns null for the code within the iframe.  The
    // workaround is to set the 'innerHTML' of a span to the iframe's HTML code,
    // with 'name' and other attributes properly set.
    function createIframe() {
        var span = document.createElement( "span" );
        params.IframeContainer.parent.appendChild( span );
        
        var iframeText = '<iframe id="' + internalID + '" name="' + internalID +
                '" src="javascript:\'<html></html>\'"';
        
        // Add iframe attributes
        var styleText = '';
        var attrs = params.IframeContainer.iframeAttrs;
        if ( attrs ) {
            for ( var attr in attrs ) {
                switch ( attr ) {
                    case "style":
                        for ( var style in attrs.style ) {
                            styleText += style + ':' + attrs.style[ style ] + ';';
                        }
                        break;
                    case "className":
                        iframeText += ' class="' + attrs[ attr ] + '"';
                        break;
                    default:
                        iframeText += ' ' + attr + '="' + attrs[ attr ] + '"';
                }
            }
        }
        
        // initially hide IFRAME content, in order to lessen frame phishing impact
        styleText += 'visibility:hidden;';
        iframeText += ' style="' + styleText + '"></iframe>';
        
        span.innerHTML = iframeText;
        
        var tunnelText;
        if ( params.IframeContainer.tunnelURI ) {
            tunnelText = "&parent=" + encodeURIComponent( params.IframeContainer.tunnelURI ) +
                         "&forcesecure=true";
        } else {
            tunnelText = "&oahParent=" +
                         encodeURIComponent( OpenAjax.gadgets.rpc.getOrigin( window.location.href ));
        }
        var idText = "";
        if ( internalID !== clientID ) {
            idText = "&oahId=" + internalID.substring( internalID.lastIndexOf('_') + 1 );
        }
        document.getElementById( internalID ).src = params.IframeContainer.uri +
                "#rpctoken=" + securityToken + tunnelText + idText;
    }
    
    // If the relay iframe used by RPC has not been loaded yet, then we won't have unload protection
    // at this point.  Since we can't detect when the relay iframe has loaded, we use a two stage
    // connection process.  First, the child sends a connection msg and the container sends an ack.
    // Then the container sends a connection msg and the child replies with an ack.  Since the
    // container can only send a message if the relay iframe has loaded, then we know if we get an
    // ack here that the relay iframe is ready.  And we are fully connected.
    function finishConnect() {
        // connect acknowledgement
        function callback( result ) {
            if ( result ) {
                connected = true;
                clearTimeout( loadTimer );
                document.getElementById( internalID ).style.visibility = "visible";
                if ( params.Container.onConnect ) {
                    try {
                        params.Container.onConnect.call( scope, container );
                    } catch( e ) {
                        OpenAjax.hub._debugger();
                        log( "caught error from onConnect callback to constructor: " + e.message );
                    }
                }
            }
        }
        OpenAjax.gadgets.rpc.call( internalID, "openajax.pubsub", callback, "cmd", "con" );
    }
    
    function finishDisconnect() {
        if ( connected ) {
            connected = false;
            document.getElementById( internalID ).style.visibility = "hidden";
        
            // unsubscribe from all subs
            for ( var s in subs ) {
                hub.unsubscribeForClient( container, subs[s] );
            }
            subs = {};
        }
    }
    
    function invokeSecurityAlert( errorMsg ) {
        try {
            params.Container.onSecurityAlert.call( scope, container, errorMsg );
        } catch( e ) {
            OpenAjax.hub._debugger();
            log( "caught error from onSecurityAlert callback to constructor: " + e.message );
        }
    }
    
    function startLoadTimer() {
        loadTimer = setTimeout(
            function() {
                // alert the security alert callback
                invokeSecurityAlert( OpenAjax.hub.SecurityAlert.LoadTimeout );
                // don't receive any more messages from HubClient
                container._handleIncomingRPC = function() {};
            },
            timeout
        );
    }
    
    
    this._init();
};

////////////////////////////////////////////////////////////////////////////////

/**
 * Create a new IframeHubClient.
 * @constructor
 * @extends OpenAjax.hub.HubClient
 * 
 * @param {Object} params
 *    Once the constructor is called, the params object belongs to the
 *    HubClient. The caller MUST not modify it.
 *    The following are the pre-defined properties on params:
 * @param {Function} params.HubClient.onSecurityAlert
 *     Called when an attempted security breach is thwarted
 * @param {Object} [params.HubClient.scope]
 *     Whenever one of the HubClient's callback functions is called,
 *     references to "this" in the callback will refer to the scope object.
 *     If not provided, the default is window.
 * @param {Function} [params.HubClient.log]
 *     Optional logger function. Would be used to log to console.log or
 *     equivalent. 
 * @param {Boolean} [params.IframeHubClient.requireParentVerifiable]
 *     Set to true in order to require that this IframeHubClient use a
 *     transport that can verify the parent Container's identity.
 * @param {Function} [params.IframeHubClient.seed]
 *     A function that returns a string that will be used to seed the
 *     pseudo-random number generator, which is used to create the security
 *     tokens.  An implementation of IframeHubClient may choose to ignore
 *     this value.
 * @param {Number} [params.IframeHubClient.tokenLength]
 *     Length of the security tokens used when transmitting messages.  If
 *     not specified, defaults to 6.  An implementation of IframeHubClient
 *     may choose to ignore this value.
 *     
 * @throws {OpenAjax.hub.Error.BadParameters} if any of the required
 *          parameters is missing, or if a parameter value is invalid in 
 *          some way.
 */
OpenAjax.hub.IframeHubClient = function( params )
{
    if ( ! params || ! params.HubClient || ! params.HubClient.onSecurityAlert ) {
        throw new Error( OpenAjax.hub.Error.BadParameters );
    }
    
    var client = this;
    var scope = params.HubClient.scope || window;
    var connected = false;
    var subs = {};
    var subIndex = 0;
    var clientID;
//    var securityToken;    // XXX still need "securityToken"?
    
    if ( params.HubClient.log ) {
        var log = function( msg ) {
            try {
                params.HubClient.log.call( scope, "IframeHubClient::" + clientID + ": " + msg );
            } catch( e ) {
                OpenAjax.hub._debugger();
            }
        };
    } else {
        log = function() {};
    }
    
    this._init = function() {
        var urlParams = OpenAjax.gadgets.util.getUrlParameters();
        if ( ! urlParams.parent ) {
            // The RMR transport does not require a valid relay file, but does need a URL
            // in the parent's domain. The URL does not need to point to valid file, so just
            // point to 'robots.txt' file. See RMR transport code for more info.
            var parent = urlParams.oahParent + "/robots.txt";
            OpenAjax.gadgets.rpc.setupReceiver( "..", parent );
        }
        
        if ( params.IframeHubClient && params.IframeHubClient.requireParentVerifiable &&
             OpenAjax.gadgets.rpc.getReceiverOrigin( ".." ) === null ) {
            // If user set 'requireParentVerifiable' to true but RPC transport does not
            // support this, throw error.
            OpenAjax.gadgets.rpc.removeReceiver( ".." );
            throw new Error( OpenAjax.hub.Error.IncompatBrowser );
        }
        
        OpenAjax.hub.IframeContainer._rpcRouter.add( "..", this );
// XXX The RPC layer initializes immediately on load, in the child (IframeHubClient). So it is too
//    late here to specify a security token for the RPC layer.  At the moment, only the NIX
//    transport requires a child token (IFPC [aka FIM] is not supported).
//        securityToken = generateSecurityToken( params, scope, log );

        clientID = OpenAjax.gadgets.rpc.RPC_ID;
        if ( urlParams.oahId ) {
            clientID = clientID.substring( 0, clientID.lastIndexOf('_') );
        }
    };
    
  /*** HubClient interface ***/

    this.connect = function( onComplete, scope ) {
        if ( connected ) {
            throw new Error( OpenAjax.hub.Error.Duplicate );
        }
        
        // connect acknowledgement
        function callback( result ) {
            if ( result ) {
                connected = true;
                if ( onComplete ) {
                    try {
                        onComplete.call( scope || window, client, true );
                    } catch( e ) {
                        OpenAjax.hub._debugger();
                        log( "caught error from onComplete callback to connect(): " + e.message );
                    }
                }
            }
        }
        OpenAjax.gadgets.rpc.call( "..", "openajax.pubsub", callback, "con" );
    };
    
    this.disconnect = function( onComplete, scope ) {
        if ( !connected ) {
            throw new Error( OpenAjax.hub.Error.Disconnected );
        }
        
        connected = false;
        
        // disconnect acknowledgement
        var callback = null;
        if ( onComplete ) {
            callback = function( result ) {
                try {
                    onComplete.call( scope || window, client, true );
                } catch( e ) {
                    OpenAjax.hub._debugger();
                    log( "caught error from onComplete callback to disconnect(): " + e.message );
                }
            };
        }
        OpenAjax.gadgets.rpc.call( "..", "openajax.pubsub", callback, "dis" );
    };
    
    this.getPartnerOrigin = function() {
        if ( connected ) {
            var origin = OpenAjax.gadgets.rpc.getReceiverOrigin( ".." );
            if ( origin ) {
                // remove port if present
                return ( /^([a-zA-Z]+:\/\/[^:]+).*/.exec( origin )[1] );
            }
        }
        return null;
    };
    
    this.getClientID = function() {
        return clientID;
    };
    
  /*** Hub interface ***/
    
    this.subscribe = function( topic, onData, scope, onComplete, subscriberData ) {
        assertConn();
        assertSubTopic( topic );
        if ( ! onData ) {
            throw new Error( OpenAjax.hub.Error.BadParameters );
        }
    
        scope = scope || window;
        var subID = "" + subIndex++;
        subs[ subID ] = { cb: onData, sc: scope, d: subscriberData };
        
        // subscribe acknowledgement
        function callback( result ) {
            if ( result !== '' ) {    // error
                delete subs[ subID ];
            }
            if ( onComplete ) {
                try {
                    onComplete.call( scope, subID, result === "", result );
                } catch( e ) {
                    OpenAjax.hub._debugger();
                    log( "caught error from onComplete callback to subscribe(): " + e.message );
                }
            }
        }
        OpenAjax.gadgets.rpc.call( "..", "openajax.pubsub", callback, "sub", topic, subID );
        
        return subID;
    };
    
    this.publish = function( topic, data ) {
        assertConn();
        assertPubTopic( topic );
        OpenAjax.gadgets.rpc.call( "..", "openajax.pubsub", null, "pub", topic, data );
    };
    
    this.unsubscribe = function( subscriptionID, onComplete, scope ) {
        assertConn();
        if ( ! subscriptionID ) {
            throw new Error( OpenAjax.hub.Error.BadParameters );
        }
        
        // if no such subscriptionID, or in process of unsubscribing given ID, throw error
        if ( ! subs[ subscriptionID ] || subs[ subscriptionID ].uns ) {
            throw new Error( OpenAjax.hub.Error.NoSubscription );
        }
        
        // unsubscribe in progress
        subs[ subscriptionID ].uns = true;
        
        // unsubscribe acknowledgement
        function callback( result ) {
            delete subs[ subscriptionID ];
            if ( onComplete ) {
                try {
                    onComplete.call( scope || window, subscriptionID, true );
                } catch( e ) {
                    OpenAjax.hub._debugger();
                    log( "caught error from onComplete callback to unsubscribe(): " + e.message );
                }
            }
        }
        OpenAjax.gadgets.rpc.call( "..", "openajax.pubsub", callback, "uns", null, subscriptionID );
    };
    
    this.isConnected = function() {
        return connected;
    };
    
    this.getScope = function() {
        return scope;
    };
    
    this.getSubscriberData = function( subscriptionID ) {
        assertConn();
        if ( subs[ subscriptionID ] ) {
            return subs[ subscriptionID ].d;
        }
        throw new Error( OpenAjax.hub.Error.NoSubscription );
    };
    
    this.getSubscriberScope = function( subscriptionID ) {
        assertConn();
        if ( subs[ subscriptionID ] ) {
            return subs[ subscriptionID ].sc;
        }
        throw new Error( OpenAjax.hub.Error.NoSubscription );
    };
    
    this.getParameters = function() {
        return params;
    };
    
  /*** private functions ***/
    
    this._handleIncomingRPC = function( command, topic, data, subscriptionID ) {
        if ( command === "pub" ) {
            // if subscription exists and we are not in process of unsubscribing...
            if ( subs[ subscriptionID ] && ! subs[ subscriptionID ].uns ) {
                try {
                    subs[ subscriptionID ].cb.call( subs[ subscriptionID ].sc, topic,
                            data, subs[ subscriptionID ].d );
                } catch( e ) {
                    OpenAjax.hub._debugger();
                    log( "caught error from onData callback to subscribe(): " + e.message );
                }
            }
        }
        // else if command === "cmd"...
        
        // First time this function is called, topic should be "con".  This is the 2nd stage of the
        // connection process.  Simply need to return "true" in order to send an acknowledgement
        // back to container.  See finishConnect() in the container object.
        if ( topic === "con" ) {
          return true;
        }
        return false;
    };
    
    function assertConn() {
        if ( ! connected ) {
            throw new Error( OpenAjax.hub.Error.Disconnected );
        }
    }
    
    function assertSubTopic( topic )
    {
        if ( ! topic ) {
            throw new Error( OpenAjax.hub.Error.BadParameters );
        }
        var path = topic.split(".");
        var len = path.length;
        for (var i = 0; i < len; i++) {
            var p = path[i];
            if ((p === "") ||
               ((p.indexOf("*") != -1) && (p != "*") && (p != "**"))) {
                throw new Error( OpenAjax.hub.Error.BadParameters );
            }
            if ((p == "**") && (i < len - 1)) {
                throw new Error( OpenAjax.hub.Error.BadParameters );
            }
        }
    }
    
    function assertPubTopic( topic ) {
        if ( !topic || topic === "" || (topic.indexOf("*") != -1) ||
            (topic.indexOf("..") != -1) ||  (topic.charAt(0) == ".") ||
            (topic.charAt(topic.length-1) == "."))
        {
            throw new Error( OpenAjax.hub.Error.BadParameters );
        }
    }
    
//    function invokeSecurityAlert( errorMsg ) {
//        try {
//            params.HubClient.onSecurityAlert.call( scope, client, errorMsg );
//        } catch( e ) {
//            OpenAjax.hub._debugger();
//            log( "caught error from onSecurityAlert callback to constructor: " + e.message );
//        }
//    }

    
    this._init();
};

////////////////////////////////////////////////////////////////////////////////

    // RPC object contents:
    //   s: Service Name
    //   f: From
    //   c: The callback ID or 0 if none.
    //   a: The arguments for this RPC call.
    //   t: The authentication token.
OpenAjax.hub.IframeContainer._rpcRouter = function() {
    var receivers = {};
    
    function router() {
        var r = receivers[ this.f ];
        if ( r ) {
            return r._handleIncomingRPC.apply( r, arguments );
        }
    }
    
    function onSecurityAlert( receiverId, error ) {
        var r = receivers[ receiverId ];
        if ( r ) {
          r._onSecurityAlert.call( r, error );
        }
    }
    
    return {
        add: function( id, receiver ) {
            function _add( id, receiver ) {
                if ( id === ".." ) {
                    if ( ! receivers[ ".." ] ) {
                        receivers[ ".." ] = receiver;
                    }
                    return;
                }
                
                var newId = id;
                while ( document.getElementById(newId) ) {
                    // a client with the specified ID already exists on this page;
                    // create a unique ID
                    newId = id + '_' + ((0x7fff * Math.random()) | 0).toString(16);
                };
                receivers[ newId ] = receiver;
                return newId;
            }
            
            // when this function is first called, register the RPC service
            OpenAjax.gadgets.rpc.register( "openajax.pubsub", router );
            OpenAjax.gadgets.rpc.config({
                securityCallback: onSecurityAlert
            });

            rpcErrorsToOAA[ OpenAjax.gadgets.rpc.SEC_ERROR_LOAD_TIMEOUT ] = OpenAjax.hub.SecurityAlert.LoadTimeout;
            rpcErrorsToOAA[ OpenAjax.gadgets.rpc.SEC_ERROR_FRAME_PHISH ] = OpenAjax.hub.SecurityAlert.FramePhish;
            rpcErrorsToOAA[ OpenAjax.gadgets.rpc.SEC_ERROR_FORGED_MSG ] = OpenAjax.hub.SecurityAlert.ForgedMsg;
            
            this.add = _add;
            return _add( id, receiver );
        },
        
        remove: function( id ) {
            delete receivers[ id ];
        }
    };
}();

var rpcErrorsToOAA = {};

////////////////////////////////////////////////////////////////////////////////

function generateSecurityToken( params, scope, log ) {
    if ( ! OpenAjax.hub.IframeContainer._prng ) {
        // create pseudo-random number generator with a default seed
        var seed = new Date().getTime() + Math.random() + document.cookie;
        OpenAjax.hub.IframeContainer._prng = OpenAjax._smash.crypto.newPRNG( seed );
    }
    
    var p = params.IframeContainer || params.IframeHubClient;
    if ( p && p.seed ) {
        try {
            var extraSeed = p.seed.call( scope );
            OpenAjax.hub.IframeContainer._prng.addSeed( extraSeed );
        } catch( e ) {
            OpenAjax.hub._debugger();
            log( "caught error from 'seed' callback: " + e.message );
        }
    }
    
    var tokenLength = (p && p.tokenLength) || 6;
    return OpenAjax.hub.IframeContainer._prng.nextRandomB64Str( tokenLength );
}

})();
}

return OpenAjax;

});

/*

        Copyright 2006-2009 OpenAjax Alliance

        Licensed under the Apache License, Version 2.0 (the "License"); 
        you may not use this file except in compliance with the License. 
        You may obtain a copy of the License at
        
                http://www.apache.org/licenses/LICENSE-2.0

        Unless required by applicable law or agreed to in writing, software 
        distributed under the License is distributed on an "AS IS" BASIS, 
        WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. 
        See the License for the specific language governing permissions and 
        limitations under the License.
*/

define('OpenAjax/containers/iframe/crypto',[ 'OpenAjax/hub/hub'], function( OpenAjax ){

// SMASH.CRYPTO
//
// Small library containing some minimal crypto functionality for a
// - a hash-function: SHA-1 (see FIPS PUB 180-2 for definition)
//     BigEndianWord[5] <- smash.crypto.sha1( BigEndianWord[*] dataWA, int lenInBits)
//
// - a message authentication code (MAC): HMAC-SHA-1 (RFC2104/2202)
//     BigEndianWord[5] <- smash.crypto.hmac_sha1(
//                            BigEndianWord[3-16] keyWA, 
//                            Ascii or Unicode string dataS,
//		 		 		       int chrsz (8 for Asci/16 for Unicode)
//
// - pseudo-random number generator (PRNG): HMAC-SHA-1 in counter mode, following
//   Barak & Halevi, An architecture for robust pseudo-random generation and applications to /dev/random, CCS 2005
//     rngObj <- smash.crypto.newPRNG( String[>=12] seedS)
//   where rngObj has methods
//     addSeed(String seed)
//     BigEndianWord[len] <- nextRandomOctets(int len)
//     Base64-String[len] <- nextRandomB64Str(int len)
//   Note: HMAC-SHA1 in counter-mode does not provide forward-security on corruption. 
//         However, the PRNG state is kept inside a closure. So if somebody can break the closure, he probably could
//         break a whole lot more and forward-security of the prng is not the highest of concerns anymore :-)

if ( typeof OpenAjax._smash == 'undefined' ) { OpenAjax._smash = {}; }

OpenAjax._smash.crypto = {

  // Some utilities
  // convert a string to an array of big-endian words
  'strToWA': function (/* Ascii or Unicode string */ str, /* int 8 for Asci/16 for Unicode */ chrsz){
    var bin = Array();
    var mask = (1 << chrsz) - 1;
    for(var i = 0; i < str.length * chrsz; i += chrsz)
      bin[i>>5] |= (str.charCodeAt(i / chrsz) & mask) << (32 - chrsz - i%32);
    return bin;
  },


  // MAC
  'hmac_sha1' : function(
        /* BigEndianWord[3-16]*/             keyWA,
       /* Ascii or Unicode string */       dataS,
       /* int 8 for Asci/16 for Unicode */ chrsz)
  {
    // write our own hmac derived from paj's so we do not have to do constant key conversions and length checking ...
    var ipad = Array(16), opad = Array(16);
    for(var i = 0; i < 16; i++) {
      ipad[i] = keyWA[i] ^ 0x36363636;
      opad[i] = keyWA[i] ^ 0x5C5C5C5C;
    }

    var hash = this.sha1( ipad.concat(this.strToWA(dataS, chrsz)), 512 + dataS.length * chrsz);
    return     this.sha1( opad.concat(hash), 512 + 160);
  },


  // PRNG factory method
  // see below 'addSeed', 'nextRandomOctets' & 'nextRandomB64Octets' for public methods of returnd prng object
  'newPRNG' : function (/* String[>=12] */ seedS) {
    var that = this;

    // parameter checking
    // We cannot really verify entropy but obviously the string must have at least a minimal length to have enough entropy
    // However, a 2^80 security seems ok, so we check only that at least 12 chars assuming somewhat random ASCII
    if ( (typeof seedS != 'string') || (seedS.length < 12) ) {
      alert("WARNING: Seed length too short ...");
    }

    // constants
    var __refresh_keyWA = [ 0xA999, 0x3E36, 0x4706, 0x816A,
    		 		 		     0x2571, 0x7850, 0xC26C, 0x9CD0,
    		 		 		     0xBA3E, 0xD89D, 0x1233, 0x9525,
    		 		 		     0xff3C, 0x1A83, 0xD491, 0xFF15 ]; // some random key for refresh ...

    // internal state
    var _keyWA = []; // BigEndianWord[5]
    var _cnt = 0;  // int

    function extract(seedS) {
      return that.hmac_sha1(__refresh_keyWA, seedS, 8);
    }

    function refresh(seedS) {
      // HMAC-SHA1 is not ideal, Rijndal 256bit block/key in CBC mode with fixed key might be better
      // but to limit the primitives and given that we anyway have only limited entropy in practise
      // this seems good enough
      var uniformSeedWA = extract(seedS);
      for(var i = 0; i < 5; i++) {
        _keyWA[i] ^= uniformSeedWA[i];
      }
    }

    // inital state seeding
    refresh(seedS);

    // public methods
    return {
      // Mix some additional seed into the PRNG state
      'addSeed'         : function (/* String */ seed) {
        // no parameter checking. Any added entropy should be fine ...
        refresh(seed);
      },


      // Get an array of len random octets
      'nextRandomOctets' : /* BigEndianWord[len] <- */ function (/* int */ len) {
		 var randOctets = [];
		 while (len > 0) {
		   _cnt+=1;
		   var nextBlock = that.hmac_sha1(_keyWA, (_cnt).toString(16), 8);
		   for (i=0; (i < 20) & (len > 0); i++, len--) {
		     randOctets.push( (nextBlock[i>>2] >> (i % 4) ) % 256);
		   }
		   // Note: if len was not a multiple 20, some random octets are ignored here but who cares ..
		 }
		 return randOctets;
      },


      // Get a random string of Base64-like (see below) chars of length len
      // Note: there is a slightly non-standard Base64 with no padding and '-' and '_' for '+' and '/', respectively
      'nextRandomB64Str' : /* Base64-String <- */ function (/* int */ len) {
		 var b64StrMap = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

		 var randOctets = this.nextRandomOctets(len);
		 var randB64Str = '';
		 for (var i=0; i < len; i++) {
		   randB64Str += b64StrMap.charAt(randOctets[i] & 0x3F);
		 }
        return randB64Str;
      }

    }
  },


  // Digest function:
  // BigEndianWord[5] <- sha1( BigEndianWord[*] dataWA, int lenInBits)
  'sha1' : function(){
    // Note: all Section references below refer to FIPS 180-2.

    // private utility functions

    // - 32bit addition with wrap-around
    var add_wa = function (x, y){
      var lsw = (x & 0xFFFF) + (y & 0xFFFF);
      var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
      return (msw << 16) | (lsw & 0xFFFF);
    }

    // - 32bit rotatate left
    var rol = function(num, cnt) {
      return (num << cnt) | (num >>> (32 - cnt));
    }

    // - round-dependent function f_t from Section 4.1.1
    function sha1_ft(t, b, c, d) {
      if(t < 20) return (b & c) | ((~b) & d);
      if(t < 40) return b ^ c ^ d;
      if(t < 60) return (b & c) | (b & d) | (c & d);
      return b ^ c ^ d;
    }

    // - round-dependent SHA-1 constants from Section 4.2.1
    function sha1_kt(t) {
      return (t < 20) ?  1518500249 :
             (t < 40) ?  1859775393 :
             (t < 60) ? -1894007588 :
          /* (t < 80) */ -899497514 ;
    }

    // main algorithm. 
    return function( /* BigEndianWord[*] */ dataWA, /* int */ lenInBits) {

      // Section 6.1.1: Preprocessing
      //-----------------------------
      // 1. padding:  (see also Section 5.1.1)
      //  - append one 1 followed by 0 bits filling up 448 bits of last (512bit) block
      dataWA[lenInBits >> 5] |= 0x80 << (24 - lenInBits % 32);
      //  - encode length in bits in last 64 bits
      //    Note: we rely on javascript to zero file elements which are beyond last (partial) data-block
      //    but before this length encoding!
      dataWA[((lenInBits + 64 >> 9) << 4) + 15] = lenInBits;

      // 2. 512bit blocks (actual split done ondemand later)
      var W = Array(80);

      // 3. initial hash using SHA-1 constants on page 13
      var H0 =  1732584193;
      var H1 = -271733879;
      var H2 = -1732584194;
      var H3 =  271733878;
      var H4 = -1009589776;

      // 6.1.2 SHA-1 Hash Computation
      for(var i = 0; i < dataWA.length; i += 16) {
        // 1. Message schedule, done below
        // 2. init working variables
        var a = H0; var b = H1; var c = H2; var d = H3; var e = H4;

        // 3. round-functions
        for(var j = 0; j < 80; j++)
        {
      		 // postponed step 2
          W[j] = ( (j < 16) ? dataWA[i+j] : rol(W[j-3] ^ W[j-8] ^ W[j-14] ^ W[j-16], 1));

          var T = add_wa( add_wa( rol(a, 5), sha1_ft(j, b, c, d)),
                          add_wa( add_wa(e, W[j]), sha1_kt(j)) );
          e = d;
          d = c;
          c = rol(b, 30);
          b = a;
          a = T;
        }

		 // 4. intermediate hash
        H0 = add_wa(a, H0);
        H1 = add_wa(b, H1);
        H2 = add_wa(c, H2);
        H3 = add_wa(d, H3);
        H4 = add_wa(e, H4);
      }

      return Array(H0, H1, H2, H3, H4);
    }
  }()

};

return OpenAjax;
});

/*
    http://www.JSON.org/json2.js
    2008-11-19

    Public Domain.

    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

    See http://www.JSON.org/js.html

    This file creates a global JSON object containing two methods: stringify
    and parse.

        JSON.stringify(value, replacer, space)
            value       any JavaScript value, usually an object or array.

            replacer    an optional parameter that determines how object
                        values are stringified for objects. It can be a
                        function or an array of strings.

            space       an optional parameter that specifies the indentation
                        of nested structures. If it is omitted, the text will
                        be packed without extra whitespace. If it is a number,
                        it will specify the number of spaces to indent at each
                        level. If it is a string (such as '\t' or '&nbsp;'),
                        it contains the characters used to indent at each level.

            This method produces a JSON text from a JavaScript value.

            When an object value is found, if the object contains a toJSON
            method, its toJSON method will be called and the result will be
            stringified. A toJSON method does not serialize: it returns the
            value represented by the name/value pair that should be serialized,
            or undefined if nothing should be serialized. The toJSON method
            will be passed the key associated with the value, and this will be
            bound to the object holding the key.

            For example, this would serialize Dates as ISO strings.

                Date.prototype.toJSON = function (key) {
                    function f(n) {
                        // Format integers to have at least two digits.
                        return n < 10 ? '0' + n : n;
                    }

                    return this.getUTCFullYear()   + '-' +
                         f(this.getUTCMonth() + 1) + '-' +
                         f(this.getUTCDate())      + 'T' +
                         f(this.getUTCHours())     + ':' +
                         f(this.getUTCMinutes())   + ':' +
                         f(this.getUTCSeconds())   + 'Z';
                };

            You can provide an optional replacer method. It will be passed the
            key and value of each member, with this bound to the containing
            object. The value that is returned from your method will be
            serialized. If your method returns undefined, then the member will
            be excluded from the serialization.

            If the replacer parameter is an array of strings, then it will be
            used to select the members to be serialized. It filters the results
            such that only members with keys listed in the replacer array are
            stringified.

            Values that do not have JSON representations, such as undefined or
            functions, will not be serialized. Such values in objects will be
            dropped; in arrays they will be replaced with null. You can use
            a replacer function to replace those with JSON values.
            JSON.stringify(undefined) returns undefined.

            The optional space parameter produces a stringification of the
            value that is filled with line breaks and indentation to make it
            easier to read.

            If the space parameter is a non-empty string, then that string will
            be used for indentation. If the space parameter is a number, then
            the indentation will be that many spaces.

            Example:

            text = JSON.stringify(['e', {pluribus: 'unum'}]);
            // text is '["e",{"pluribus":"unum"}]'


            text = JSON.stringify(['e', {pluribus: 'unum'}], null, '\t');
            // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'

            text = JSON.stringify([new Date()], function (key, value) {
                return this[key] instanceof Date ?
                    'Date(' + this[key] + ')' : value;
            });
            // text is '["Date(---current time---)"]'


        JSON.parse(text, reviver)
            This method parses a JSON text to produce an object or array.
            It can throw a SyntaxError exception.

            The optional reviver parameter is a function that can filter and
            transform the results. It receives each of the keys and values,
            and its return value is used instead of the original value.
            If it returns what it received, then the structure is not modified.
            If it returns undefined then the member is deleted.

            Example:

            // Parse the text. Values that look like ISO date strings will
            // be converted to Date objects.

            myData = JSON.parse(text, function (key, value) {
                var a;
                if (typeof value === 'string') {
                    a =
/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
                    if (a) {
                        return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4],
                            +a[5], +a[6]));
                    }
                }
                return value;
            });

            myData = JSON.parse('["Date(09/09/2001)"]', function (key, value) {
                var d;
                if (typeof value === 'string' &&
                        value.slice(0, 5) === 'Date(' &&
                        value.slice(-1) === ')') {
                    d = new Date(value.slice(5, -1));
                    if (d) {
                        return d;
                    }
                }
                return value;
            });


    This is a reference implementation. You are free to copy, modify, or
    redistribute.

    This code should be minified before deployment.
    See http://javascript.crockford.com/jsmin.html

    USE YOUR OWN COPY. IT IS EXTREMELY UNWISE TO LOAD CODE FROM SERVERS YOU DO
    NOT CONTROL.
*/

/*jslint evil: true */

/*global JSON */

/*members "", "\b", "\t", "\n", "\f", "\r", "\"", JSON, "\\", apply,
    call, charCodeAt, getUTCDate, getUTCFullYear, getUTCHours,
    getUTCMinutes, getUTCMonth, getUTCSeconds, hasOwnProperty, join,
    lastIndex, length, parse, prototype, push, replace, slice, stringify,
    test, toJSON, toString, valueOf
*/

// Create a JSON object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables.

if (!this.JSON) {
    JSON = {};
}
(function () {

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    if (typeof Date.prototype.toJSON !== 'function') {

        Date.prototype.toJSON = function (key) {

            return this.getUTCFullYear()   + '-' +
                 f(this.getUTCMonth() + 1) + '-' +
                 f(this.getUTCDate())      + 'T' +
                 f(this.getUTCHours())     + ':' +
                 f(this.getUTCMinutes())   + ':' +
                 f(this.getUTCSeconds())   + 'Z';
        };

        String.prototype.toJSON =
        Number.prototype.toJSON =
        Boolean.prototype.toJSON = function (key) {
            return this.valueOf();
        };
    }

    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        gap,
        indent,
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        },
        rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ?
            '"' + string.replace(escapable, function (a) {
                var c = meta[a];
                return typeof c === 'string' ? c :
                    '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' :
            '"' + string + '"';
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === 'object' &&
                typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case 'string':
            return quote(value);

        case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

            return isFinite(value) ? String(value) : 'null';

        case 'boolean':
        case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

            return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

        case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

            if (!value) {
                return 'null';
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0 ? '[]' :
                    gap ? '[\n' + gap +
                            partial.join(',\n' + gap) + '\n' +
                                mind + ']' :
                          '[' + partial.join(',') + ']';
                gap = mind;
                return v;
            }

// If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === 'object') {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    k = rep[i];
                    if (typeof k === 'string') {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            } else {

// Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0 ? '{}' :
                gap ? '{\n' + gap + partial.join(',\n' + gap) + '\n' +
                        mind + '}' : '{' + partial.join(',') + '}';
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = '';
            indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === 'number') {
                for (i = 0; i < space; i += 1) {
                    indent += ' ';
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === 'string') {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== 'function' &&
                    (typeof replacer !== 'object' ||
                     typeof replacer.length !== 'number')) {
                throw new Error('JSON.stringify');
            }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

            return str('', {'': value});
        };
    }


// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            cx.lastIndex = 0;
            if (cx.test(text)) {
                text = text.replace(cx, function (a) {
                    return '\\u' +
                        ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (/^[\],:{}\s]*$/.
test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@').
replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function' ?
                    walk({'': j}, '') : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        };
    }
})();

define("OpenAjax/containers/iframe/json2", function(){});

/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

define('OpenAjax/containers/iframe/rpc/rpc-dependencies',[
    'OpenAjax/hub/hub',
    'OpenAjax/containers/inline/inline',
    'OpenAjax/containers/iframe/iframe',
    'OpenAjax/containers/iframe/crypto',
    'OpenAjax/containers/iframe/json2'
], function( OpenAjax ){

/**
 * @fileoverview External functions used by the OpenSocial RPC code.  This file
 *               is for use by OpenAjax only.
 */

    //---   from core.util/util.js   ---//

/**
 * @static
 * @class Provides general-purpose utility functions.
 * @name gadgets.util
 */

OpenAjax.gadgets.util = function() {
  /**
   * Parses URL parameters into an object.
   * @param {string} url - the url parameters to parse
   * @return {Array.<string>} The parameters as an array
   */
  function parseUrlParams(url) {
    // Get settings from url, 'hash' takes precedence over 'search' component
    // don't use document.location.hash due to browser differences.
    var query;
    var queryIdx = url.indexOf("?");
    var hashIdx = url.indexOf("#");
    if (hashIdx === -1) {
      query = url.substr(queryIdx + 1);
    } else {
      // essentially replaces "#" with "&"
      query = [url.substr(queryIdx + 1, hashIdx - queryIdx - 1), "&",
               url.substr(hashIdx + 1)].join("");
    }
    return query.split("&");
  }

  var parameters = null;
  var onLoadHandlers = [];

  return /** @scope gadgets.util */ {

    /**
     * Gets the URL parameters.
     *
     * @param {string=} opt_url Optional URL whose parameters to parse.
     *                         Defaults to window's current URL.
     * @return {Object} Parameters passed into the query string
     * @member gadgets.util
     * @private Implementation detail.
     */
    getUrlParameters : function (opt_url) {
      if (parameters !== null && typeof opt_url === "undefined") {
        // "parameters" is a cache of current window params only.
        return parameters;
      }
      var parsed = {};
      var pairs = parseUrlParams(opt_url || document.location.href);
      var unesc = window.decodeURIComponent ? decodeURIComponent : unescape;
      for (var i = 0, j = pairs.length; i < j; ++i) {
        var pos = pairs[i].indexOf('=');
        if (pos === -1) {
          continue;
        }
        var argName = pairs[i].substring(0, pos);
        var value = pairs[i].substring(pos + 1);
        // difference to IG_Prefs, is that args doesn't replace spaces in
        // argname. Unclear on if it should do:
        // argname = argname.replace(/\+/g, " ");
        value = value.replace(/\+/g, " ");
        parsed[argName] = unesc(value);
      }
      if (typeof opt_url === "undefined") {
        // Cache current-window params in parameters var.
        parameters = parsed;
      }
      return parsed;
    },

    /**
     * Registers an onload handler.
     * @param {function()} callback The handler to run
     *
     * @member gadgets.util
     */
    registerOnLoadHandler : function (callback) {
      onLoadHandlers.push(callback);
    },

    /**
     * Runs all functions registered via registerOnLoadHandler.
     * @private Only to be used by the container, not gadgets.
     */
    runOnLoadHandlers : function () {
      for (var i = 0, j = onLoadHandlers.length; i < j; ++i) {
        onLoadHandlers[i]();
      }
    },

    /**
     * Attach an event listener to given DOM element
     * 
     * @param {object} elem  DOM element on which to attach event.
     * @param {string} eventName  Event type to listen for.
     * @param {function} callback  Invoked when specified event occurs.
     * @param {boolean} useCapture  If true, initiates capture.
     */
    'attachBrowserEvent': function(elem, eventName, callback, useCapture) {
      if (elem.addEventListener) {
        elem.addEventListener(eventName, callback, useCapture);
      } else if (elem.attachEvent) {
        elem.attachEvent('on' + eventName, callback);
      }
    },

    /**
     * Remove event listener
     * 
     * @param {object} elem  DOM element from which to remove event.
     * @param {string} eventName  Event type to remove.
     * @param {function} callback  Listener to remove.
     * @param {boolean} useCapture  Specifies whether listener being removed was added with
     *                              capture enabled.
     */
    'removeBrowserEvent': function(elem, eventName, callback, useCapture) {
      if (elem.removeEventListener) {
        elem.removeEventListener(eventName, callback, useCapture);
      } else if (elem.detachEvent){
        elem.detachEvent('on' + eventName, callback);
      }
    }
  };
}();
// Initialize url parameters so that hash data is pulled in before it can be
// altered by a click.
OpenAjax.gadgets.util.getUrlParameters();


    //---   from core.json/json.js   ---//

OpenAjax.gadgets.json = OpenAjax.gadgets.json || {};
if ( ! OpenAjax.gadgets.json.stringify ) {
  OpenAjax.gadgets.json = {
    parse: function(str) {
      try {
        return window.JSON.parse(str);
      } catch (e) {
        return false;
      }
    },
    stringify: function(obj) {
      try {
        return window.JSON.stringify(obj);
      } catch (e) {
        return null;
      }
    }
  };
}


    //---   from core.log/log.js   ---//

/**
 * Log an informational message
 */
OpenAjax.gadgets.log = function(message) {
  OpenAjax.gadgets.log.logAtLevel(OpenAjax.gadgets.log.INFO, message);
};

 
/**
 * Log a warning
 */
OpenAjax.gadgets.warn = function(message) {
  OpenAjax.gadgets.log.logAtLevel(OpenAjax.gadgets.log.WARNING, message);
};

/**
 * Log an error
 */
OpenAjax.gadgets.error = function(message) {
  OpenAjax.gadgets.log.logAtLevel(OpenAjax.gadgets.log.ERROR, message);
};

/**
 * Sets the log level threshold.
 * @param {Number} logLevel - New log level threshold.
 * @static
 */
OpenAjax.gadgets.setLogLevel = function(logLevel) {
  OpenAjax.gadgets.log.logLevelThreshold_ = logLevel;
};

/**
 * Logs a log message if output console is available, and log threshold is met.
 * @param {Number} level - the level to log with. Optional, defaults to
 * @param {Object} message - The message to log
 * gadgets.log.INFO.
 * @static
 */
OpenAjax.gadgets.log.logAtLevel = function(level, message) {
  if (level < OpenAjax.gadgets.log.logLevelThreshold_ || !OpenAjax.gadgets.log._console) {
    return;
  }

  var logger;
  var gadgetconsole = OpenAjax.gadgets.log._console;

  if (level == OpenAjax.gadgets.log.WARNING && gadgetconsole.warn) {
    gadgetconsole.warn(message)
  } else if (level == OpenAjax.gadgets.log.ERROR && gadgetconsole.error) {
    gadgetconsole.error(message);
  } else if (gadgetconsole.log) {
    gadgetconsole.log(message);
  }
};

/**
 * Log level for informational logging.
 * @static
 */
OpenAjax.gadgets.log.INFO = 1;

/**
 * Log level for warning logging.
 * @static
 */
OpenAjax.gadgets.log.WARNING = 2;

/**
 * Log level for error logging.
 * @static
 */
OpenAjax.gadgets.log.ERROR = 3;

/**
 * Log level for no logging
 * @static
 */
OpenAjax.gadgets.log.NONE = 4;

/**
 * Current log level threshold.
 * @type Number
 * @private
 * @static
 */
OpenAjax.gadgets.log.logLevelThreshold_ = OpenAjax.gadgets.log.INFO;

/**
 * Console to log to
 * @private
 * @static
 */
OpenAjax.gadgets.log._console = window.console ? window.console :
                       window.opera   ? window.opera.postError : undefined;


////////////////////////////////////////////////////////////////////////////////////////////////////
//  onload handler compatibility code
////////////////////////////////////////////////////////////////////////////////////////////////////

(function() {
// XXX What if this script file (iframe.js) is dynamically loaded after the page has loaded.
if ( ! window.__isgadget ) {
    var loaded = false;
    function onload() {
        if ( ! loaded ) {
            loaded = true;
            // This is necessary for the RMR and FE transports.
            OpenAjax.gadgets.util.runOnLoadHandlers();
            // Since the page has now loaded, change registerOnLoadHandler() to immediately fire
            // callback.
            OpenAjax.gadgets.util.registerOnLoadHandler = function( callback ) {
                setTimeout( callback, 0 );
            };
            // prevent IE memory leak
            if ( window.detachEvent ) {
                window.detachEvent( "onload", onload );
            }
        }
    }
    if ( window.addEventListener ) {
        document.addEventListener( "DOMContentLoaded", onload, false );
        window.addEventListener( "load", onload, false );
    } else if ( window.attachEvent ) {
        // XXX use doScroll trick?
        window.attachEvent( "onload", onload );
    }
}
})();

return OpenAjax;
});

/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */

define('OpenAjax/containers/iframe/rpc/fe.transport',[
    'OpenAjax/hub/hub',
    'OpenAjax/containers/inline/inline',
    'OpenAjax/containers/iframe/iframe',
    'OpenAjax/containers/iframe/crypto',
    'OpenAjax/containers/iframe/json2',
    'OpenAjax/containers/iframe/rpc/rpc-dependencies'
], function( OpenAjax ){


OpenAjax.gadgets.rpctx = OpenAjax.gadgets.rpctx || {};

/*
 * For Gecko-based browsers, the security model allows a child to call a
 * function on the frameElement of the iframe, even if the child is in
 * a different domain. This method is dubbed "frameElement" (fe).
 *
 * The ability to add and call such functions on the frameElement allows
 * a bidirectional channel to be setup via the adding of simple function
 * references on the frameElement object itself. In this implementation,
 * when the container sets up the authentication information for that gadget
 * (by calling setAuth(...)) it as well adds a special function on the
 * gadget's iframe. This function can then be used by the gadget to send
 * messages to the container. In turn, when the gadget tries to send a
 * message, it checks to see if this function has its own function stored
 * that can be used by the container to call the gadget. If not, the
 * function is created and subsequently used by the container.
 * Note that as a result, FE can only be used by a container to call a
 * particular gadget *after* that gadget has called the container at
 * least once via FE.
 *
 *   fe: Gecko-specific frameElement trick.
 *      - Firefox 1+
 */
if (!OpenAjax.gadgets.rpctx.frameElement) {  // make lib resilient to double-inclusion

OpenAjax.gadgets.rpctx.frameElement = function() {
  // Consts for FrameElement.
  var FE_G2C_CHANNEL = '__g2c_rpc';
  var FE_C2G_CHANNEL = '__c2g_rpc';
  var process;
  var ready;

  function callFrameElement(targetId, from, rpc) {
    try {
      if (from !== '..') {
        // Call from gadget to the container.
        var fe = window.frameElement;

        if (typeof fe[FE_G2C_CHANNEL] === 'function') {
          // Complete the setup of the FE channel if need be.
          if (typeof fe[FE_G2C_CHANNEL][FE_C2G_CHANNEL] !== 'function') {
            fe[FE_G2C_CHANNEL][FE_C2G_CHANNEL] = function(args) {
              process(OpenAjax.gadgets.json.parse(args));
            };
          }

          // Conduct the RPC call.
          fe[FE_G2C_CHANNEL](OpenAjax.gadgets.json.stringify(rpc));
          return;
        }
      } else {
        // Call from container to gadget[targetId].
        var frame = document.getElementById(targetId);

        if (typeof frame[FE_G2C_CHANNEL] === 'function' &&
            typeof frame[FE_G2C_CHANNEL][FE_C2G_CHANNEL] === 'function') {

          // Conduct the RPC call.
          frame[FE_G2C_CHANNEL][FE_C2G_CHANNEL](OpenAjax.gadgets.json.stringify(rpc));
          return;
        }
      }
    } catch (e) {
    }
    return true;
  }

  return {
    getCode: function() {
      return 'fe';
    },

    isParentVerifiable: function() {
      return false;
    },
  
    init: function(processFn, readyFn) {
      // No global setup.
      process = processFn;
      ready = readyFn;
      return true;
    },

    setup: function(receiverId, token) {
      // Indicate OK to call to container. This will be true
      // by the end of this method.
      if (receiverId !== '..') {
        try {
          var frame = document.getElementById(receiverId);
          frame[FE_G2C_CHANNEL] = function(args) {
            process(OpenAjax.gadgets.json.parse(args));
          };
        } catch (e) {
          return false;
        }
      }
      if (receiverId === '..') {
        ready('..', true);
        var ackFn = function() {
          window.setTimeout(function() {
            OpenAjax.gadgets.rpc.call(receiverId, OpenAjax.gadgets.rpc.ACK);
          }, 500);
        };
        // Setup to container always happens before onload.
        // If it didn't, the correct fix would be in gadgets.util.
        OpenAjax.gadgets.util.registerOnLoadHandler(ackFn);
      }
      return true;
    },

    call: function(targetId, from, rpc) {
      callFrameElement(targetId, from, rpc);
    } 

  };
}();

} // !end of double-inclusion guard

return OpenAjax;
});

/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */

define('OpenAjax/containers/iframe/rpc/ifpc.transport',[
    'OpenAjax/hub/hub',
    'OpenAjax/containers/inline/inline',
    'OpenAjax/containers/iframe/iframe',
    'OpenAjax/containers/iframe/crypto',
    'OpenAjax/containers/iframe/json2',
    'OpenAjax/containers/iframe/rpc/rpc-dependencies',
    'OpenAjax/containers/iframe/rpc/fe.transport'
  ], function( OpenAjax ){

OpenAjax.gadgets.rpctx = OpenAjax.gadgets.rpctx || {};

/*
 * For all others, we have a fallback mechanism known as "ifpc". IFPC
 * exploits the fact that while same-origin policy prohibits a frame from
 * accessing members on a window not in the same domain, that frame can,
 * however, navigate the window heirarchy (via parent). This is exploited by
 * having a page on domain A that wants to talk to domain B create an iframe
 * on domain B pointing to a special relay file and with a message encoded
 * after the hash (#). This relay, in turn, finds the page on domain B, and
 * can call a receipt function with the message given to it. The relay URL
 * used by each caller is set via the gadgets.rpc.setRelayUrl(..) and
 * *must* be called before the call method is used.
 *
 *   ifpc: Iframe-based method, utilizing a relay page, to send a message.
 *      - No known major browsers still use this method, but it remains
 *        useful as a catch-all fallback for the time being.
 */
if (!OpenAjax.gadgets.rpctx.ifpc) {  // make lib resilient to double-inclusion

OpenAjax.gadgets.rpctx.ifpc = function() {
  var iframePool = [];
  var callId = 0;
  var ready;

  var URL_LIMIT = 2000;
  var messagesIn = {};

  /**
   * Encodes arguments for the legacy IFPC wire format.
   *
   * @param {Object} args
   * @return {string} the encoded args
   */
  function encodeLegacyData(args) {
    var argsEscaped = [];
    for(var i = 0, j = args.length; i < j; ++i) {
      argsEscaped.push(encodeURIComponent(OpenAjax.gadgets.json.stringify(args[i])));
    }
    return argsEscaped.join('&');
  }

  /**
   * Helper function to emit an invisible IFrame.
   * @param {string} src SRC attribute of the IFrame to emit.
   * @private
   */
  function emitInvisibleIframe(src) {
    var iframe;
    // Recycle IFrames
    for (var i = iframePool.length - 1; i >=0; --i) {
      var ifr = iframePool[i];
      try {
        if (ifr && (ifr.recyclable || ifr.readyState === 'complete')) {
          ifr.parentNode.removeChild(ifr);
          if (window.ActiveXObject) {
            // For MSIE, delete any iframes that are no longer being used. MSIE
            // cannot reuse the IFRAME because a navigational click sound will
            // be triggered when we set the SRC attribute.
            // Other browsers scan the pool for a free iframe to reuse.
            iframePool[i] = ifr = null;
            iframePool.splice(i, 1);
          } else {
            ifr.recyclable = false;
            iframe = ifr;
            break;
          }
        }
      } catch (e) {
        // Ignore; IE7 throws an exception when trying to read readyState and
        // readyState isn't set.
      }
    }
    // Create IFrame if necessary
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.style.border = iframe.style.width = iframe.style.height = '0px';
      iframe.style.visibility = 'hidden';
      iframe.style.position = 'absolute';
      iframe.onload = function() { this.recyclable = true; };
      iframePool.push(iframe);
    }
    iframe.src = src;
    window.setTimeout(function() { document.body.appendChild(iframe); }, 0);
  }

  function isMessageComplete(arr, total) {
    for (var i = total - 1; i >= 0; --i) {
      if (typeof arr[i] === 'undefined') {
        return false;
      }
    }
    return true;
  }

  return {
    getCode: function() {
      return 'ifpc';
    },

    isParentVerifiable: function() {
      return true;
    },

    init: function(processFn, readyFn) {
      // No global setup.
      ready = readyFn;
      ready('..', true);  // Ready immediately.
      return true;
    },

    setup: function(receiverId, token) {
      // Indicate readiness to send to receiver.
      ready(receiverId, true);
      return true;
    },

    call: function(targetId, from, rpc) {
      // Retrieve the relay file used by IFPC. Note that
      // this must be set before the call, and so we conduct
      // an extra check to ensure it is not blank.
      var relay = OpenAjax.gadgets.rpc.getRelayUrl(targetId);
      ++callId;

      if (!relay) {
        OpenAjax.gadgets.warn('No relay file assigned for IFPC');
        return;
      }

      // The RPC mechanism supports two formats for IFPC (legacy and current).
      var src = null,
          queueOut = [];
      if (rpc.l) {
        // Use legacy protocol.
        // Format: #iframe_id & callId & num_packets & packet_num & block_of_data
        var callArgs = rpc.a;
        src = [relay, '#', encodeLegacyData([from, callId, 1, 0,
               encodeLegacyData([from, rpc.s, '', '', from].concat(
                 callArgs))])].join('');
        queueOut.push(src);
      } else {
        // Format: #targetId & sourceId@callId & packetNum & packetId & packetData
        src = [relay, '#', targetId, '&', from, '@', callId, '&'].join('');
        var message = encodeURIComponent(OpenAjax.gadgets.json.stringify(rpc)),
            payloadLength = URL_LIMIT - src.length,
            numPackets = Math.ceil(message.length/payloadLength),
            packetIdx = 0,
            part;
        while (message.length > 0) {
          part = message.substring(0, payloadLength);
          message = message.substring(payloadLength);
          queueOut.push([src, numPackets, '&', packetIdx, '&', part].join(''));
          packetIdx += 1;
        }
      }

      // Conduct the IFPC call by creating the Iframe with
      // the relay URL and appended message.
      do {
        emitInvisibleIframe(queueOut.shift());
      } while(queueOut.length > 0);
      return true;
    },

    /** Process message from invisible iframe, merging message parts if necessary. */
    _receiveMessage: function(fragment, process) {
      var from = fragment[1],   // in the form of "<from>@<callid>"
          numPackets = parseInt(fragment[2], 10),
          packetIdx = parseInt(fragment[3], 10),
          payload = fragment[fragment.length - 1],
          completed = numPackets === 1;

      // if message is multi-part, store parts in the proper order
      if (numPackets > 1) {
        if (!messagesIn[from]) {
          messagesIn[from] = [];
        }
        messagesIn[from][packetIdx] = payload;
        // check if all parts have been sent
        if (isMessageComplete(messagesIn[from], numPackets)) {
          payload = messagesIn[from].join('');
          delete messagesIn[from];
          completed = true;
        }
      }

      // complete message sent
      if (completed) {
        process(OpenAjax.gadgets.json.parse(decodeURIComponent(payload)));
      }
    }
  };
}();

} // !end of double inclusion guard

return OpenAjax;
});

/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */
define('OpenAjax/containers/iframe/rpc/rmr.transport',[
    'OpenAjax/hub/hub',
    'OpenAjax/containers/inline/inline',
    'OpenAjax/containers/iframe/iframe',
    'OpenAjax/containers/iframe/crypto',
    'OpenAjax/containers/iframe/json2',
    'OpenAjax/containers/iframe/rpc/rpc-dependencies',
    'OpenAjax/containers/iframe/rpc/fe.transport',
    'OpenAjax/containers/iframe/rpc/ifpc.transport'
], function( OpenAjax ){

OpenAjax.gadgets.rpctx = OpenAjax.gadgets.rpctx || {};

/*
 * For older WebKit-based browsers, the security model does not allow for any
 * known "native" hacks for conducting cross browser communication. However,
 * a variation of the IFPC (see below) can be used, entitled "RMR". RMR is
 * a technique that uses the resize event of the iframe to indicate that a
 * message was sent (instead of the much slower/performance heavy polling
 * technique used when a defined relay page is not avaliable). Simply put,
 * RMR uses the same "pass the message by the URL hash" trick that IFPC
 * uses to send a message, but instead of having an active relay page that
 * runs a piece of code when it is loaded, RMR merely changes the URL
 * of the relay page (which does not even have to exist on the domain)
 * and then notifies the other party by resizing the relay iframe. RMR
 * exploits the fact that iframes in the dom of page A can be resized
 * by page A while the onresize event will be fired in the DOM of page B,
 * thus providing a single bit channel indicating "message sent to you".
 * This method has the added benefit that the relay need not be active,
 * nor even exist: a 404 suffices just as well.
 *
 *   rmr: WebKit-specific resizing trick.
 *      - Safari 2+
 *      - Chrome 1
 */
if (!OpenAjax.gadgets.rpctx.rmr) {  // make lib resilient to double-inclusion

OpenAjax.gadgets.rpctx.rmr = function() {
  // Consts for RMR, including time in ms RMR uses to poll for
  // its relay frame to be created, and the max # of polls it does.
  var RMR_SEARCH_TIMEOUT = 500;
  var RMR_MAX_POLLS = 10;

  // JavaScript references to the channel objects used by RMR.
  // Gadgets will have but a single channel under
  // rmr_channels['..'] while containers will have a channel
  // per gadget stored under the gadget's ID.
  var rmr_channels = {};
  
  var process;
  var ready;

  /**
   * Append an RMR relay frame to the document. This allows the receiver
   * to start receiving messages.
   *
   * @param {Node} channelFrame Relay frame to add to the DOM body.
   * @param {string} relayUri Base URI for the frame.
   * @param {string} data to pass along to the frame.
   * @param {string=} opt_frameId ID of frame for which relay is being appended (optional).
   */
  function appendRmrFrame(channelFrame, relayUri, data, opt_frameId) {
    var appendFn = function() {
      // Append the iframe.
      document.body.appendChild(channelFrame);

      // Set the src of the iframe to 'about:blank' first and then set it
      // to the relay URI. This prevents the iframe from maintaining a src
      // to the 'old' relay URI if the page is returned to from another.
      // In other words, this fixes the bfcache issue that causes the iframe's
      // src property to not be updated despite us assigning it a new value here.
      channelFrame.src = 'about:blank';
      if (opt_frameId) {
        // Process the initial sent payload (typically sent by container to
        // child/gadget) only when the relay frame has finished loading. We
        // do this to ensure that, in processRmrData(...), the ACK sent due
        // to processing can actually be sent. Before this time, the frame's
        // contentWindow is null, making it impossible to do so.
        channelFrame.onload = function() {
          processRmrData(opt_frameId);
        };
      }
      channelFrame.src = relayUri + '#' + data;
    };

    if (document.body) {
      appendFn();
    } else {
      // Common gadget case: attaching header during in-gadget handshake,
      // when we may still be in script in head. Attach onload.
      OpenAjax.gadgets.util.registerOnLoadHandler(function() { appendFn(); });
    }
  }

  /**
   * Sets up the RMR transport frame for the given frameId. For gadgets
   * calling containers, the frameId should be '..'.
   *
   * @param {string} frameId The ID of the frame.
   */
  function setupRmr(frameId) {
    if (typeof rmr_channels[frameId] === "object") {
      // Sanity check. Already done.
      return;
    }

    var channelFrame = document.createElement('iframe');
    var frameStyle = channelFrame.style;
    frameStyle.position = 'absolute';
    frameStyle.top = '0px';
    frameStyle.border = '0';
    frameStyle.opacity = '0';

    // The width here is important as RMR
    // makes use of the resize handler for the frame.
    // Do not modify unless you test thoroughly!
    frameStyle.width = '10px';
    frameStyle.height = '1px';
    channelFrame.id = 'rmrtransport-' + frameId;
    channelFrame.name = channelFrame.id;

    // Use the explicitly set relay, if one exists. Otherwise,
    // Construct one using the parent parameter plus robots.txt
    // as a synthetic relay. This works since browsers using RMR
    // treat 404s as legitimate for the purposes of cross domain
    // communication.
    var relayUri = OpenAjax.gadgets.rpc.getRelayUrl(frameId);
    if (!relayUri) {
      relayUri =
          OpenAjax.gadgets.rpc.getOrigin(OpenAjax.gadgets.util.getUrlParameters()["parent"]) +
          '/robots.txt';
    }

    rmr_channels[frameId] = {
      frame: channelFrame,
      receiveWindow: null,
      relayUri: relayUri,
      searchCounter : 0,
      width: 10,

      // Waiting means "waiting for acknowledgement to be received."
      // Acknowledgement always comes as a special ACK
      // message having been received. This message is received
      // during handshake in different ways by the container and
      // gadget, and by normal RMR message passing once the handshake
      // is complete.
      waiting: true,
      queue: [],

      // Number of non-ACK messages that have been sent to the recipient
      // and have been acknowledged.
      sendId: 0,

      // Number of messages received and processed from the sender.
      // This is the number that accompanies every ACK to tell the
      // sender to clear its queue.
      recvId: 0
    };

    if (frameId !== '..') {
      // Container always appends a relay to the gadget, before
      // the gadget appends its own relay back to container. The
      // gadget, in the meantime, refuses to attach the container
      // relay until it finds this one. Thus, the container knows
      // for certain that gadget to container communication is set
      // up by the time it finds its own relay. In addition to
      // establishing a reliable handshake protocol, this also
      // makes it possible for the gadget to send an initial batch
      // of messages to the container ASAP.
      appendRmrFrame(channelFrame, relayUri, getRmrData(frameId));
    }
     
    // Start searching for our own frame on the other page.
    conductRmrSearch(frameId);
  }

  /**
   * Searches for a relay frame, created by the sender referenced by
   * frameId, with which this context receives messages. Once
   * found with proper permissions, attaches a resize handler which
   * signals messages to be sent.
   *
   * @param {string} frameId Frame ID of the prospective sender.
   */
  function conductRmrSearch(frameId) {
    var channelWindow = null;

    // Increment the search counter.
    rmr_channels[frameId].searchCounter++;

    try {
      var targetWin = OpenAjax.gadgets.rpc._getTargetWin(frameId);
      if (frameId === '..') {
        // We are a gadget.
        channelWindow = targetWin.frames['rmrtransport-' + OpenAjax.gadgets.rpc.RPC_ID];
      } else {
        // We are a container.
        channelWindow = targetWin.frames['rmrtransport-..'];
      }
    } catch (e) {
      // Just in case; may happen when relay is set to about:blank or unset.
      // Catching exceptions here ensures that the timeout to continue the
      // search below continues to work.
    }

    var status = false;

    if (channelWindow) {
      // We have a valid reference to "our" RMR transport frame.
      // Register the proper event handlers.
      status = registerRmrChannel(frameId, channelWindow);
    }

    if (!status) {
      // Not found yet. Continue searching, but only if the counter
      // has not reached the threshold.
      if (rmr_channels[frameId].searchCounter > RMR_MAX_POLLS) {
        // If we reach this point, then RMR has failed and we
        // fall back to IFPC.
        return;
      }

      window.setTimeout(function() {
        conductRmrSearch(frameId);
      }, RMR_SEARCH_TIMEOUT);
    }
  }

  /**
   * Attempts to conduct an RPC call to the specified
   * target with the specified data via the RMR
   * method. If this method fails, the system attempts again
   * using the known default of IFPC.
   *
   * @param {string} targetId Module Id of the RPC service provider.
   * @param {string} serviceName Name of the service to call.
   * @param {string} from Module Id of the calling provider.
   * @param {Object} rpc The RPC data for this call.
   */
  function callRmr(targetId, serviceName, from, rpc) {
    var handler = null;

    if (from !== '..') {
      // Call from gadget to the container.
      handler = rmr_channels['..'];
    } else {
      // Call from container to the gadget.
      handler = rmr_channels[targetId];
    }

    if (handler) {
      // Queue the current message if not ACK.
      // ACK is always sent through getRmrData(...).
      if (serviceName !== OpenAjax.gadgets.rpc.ACK) {
        handler.queue.push(rpc);
      }

      if (handler.waiting ||
          (handler.queue.length === 0 &&
           !(serviceName === OpenAjax.gadgets.rpc.ACK && rpc && rpc.ackAlone === true))) {
        // If we are awaiting a response from any previously-sent messages,
        // or if we don't have anything new to send, just return.
        // Note that we don't short-return if we're ACKing just-received
        // messages.
        return true;
      }

      if (handler.queue.length > 0) {
        handler.waiting = true;
      }

      var url = handler.relayUri + "#" + getRmrData(targetId);

      try {
        // Update the URL with the message.
        handler.frame.contentWindow.location = url;

        // Resize the frame.
        var newWidth = handler.width == 10 ? 20 : 10;
        handler.frame.style.width = newWidth + 'px';
        handler.width = newWidth;

        // Done!
      } catch (e) {
        // Something about location-setting or resizing failed.
        // This should never happen, but if it does, fall back to
        // the default transport.
        return false;
      }
    }

    return true;
  }

  /**
   * Returns as a string the data to be appended to an RMR relay frame,
   * constructed from the current request queue plus an ACK message indicating
   * the currently latest-processed message ID.
   *
   * @param {string} toFrameId Frame whose sendable queued data to retrieve.
   */
  function getRmrData(toFrameId) {
    var channel = rmr_channels[toFrameId];
    var rmrData = {id: channel.sendId};
    if (channel) {
      rmrData.d = Array.prototype.slice.call(channel.queue, 0);
      rmrData.d.push({s:OpenAjax.gadgets.rpc.ACK, id:channel.recvId});
    }
    return OpenAjax.gadgets.json.stringify(rmrData);
  }

  /**
   * Retrieve data from the channel keyed by the given frameId,
   * processing it as a batch. All processed data is assumed to have been
   * generated by getRmrData(...), pairing that method with this.
   *
   * @param {string} fromFrameId Frame from which data is being retrieved.
   */
  function processRmrData(fromFrameId) {
    var channel = rmr_channels[fromFrameId];
    var data = channel.receiveWindow.location.hash.substring(1);

    // Decode the RPC object array.
    var rpcObj = OpenAjax.gadgets.json.parse(decodeURIComponent(data)) || {};
    var rpcArray = rpcObj.d || [];

    var nonAckReceived = false;
    var noLongerWaiting = false;

    var numBypassed = 0;
    var numToBypass = (channel.recvId - rpcObj.id);
    for (var i = 0; i < rpcArray.length; ++i) {
      var rpc = rpcArray[i];

      // If we receive an ACK message, then mark the current
      // handler as no longer waiting and send out the next
      // queued message.
      if (rpc.s === OpenAjax.gadgets.rpc.ACK) {
        // ACK received - whether this came from a handshake or
        // an active call, in either case it indicates readiness to
        // send messages to the from frame.
        ready(fromFrameId, true);

        if (channel.waiting) {
          noLongerWaiting = true;
        }

        channel.waiting = false;
        var newlyAcked = Math.max(0, rpc.id - channel.sendId);
        channel.queue.splice(0, newlyAcked);
        channel.sendId = Math.max(channel.sendId, rpc.id || 0);
        continue;
      }

      // If we get here, we've received > 0 non-ACK messages to
      // process. Indicate this bit for later.
      nonAckReceived = true;

      // Bypass any messages already received.
      if (++numBypassed <= numToBypass) {
        continue;
      }

      ++channel.recvId;
      process(rpc);  // actually dispatch the message
    }

    // Send an ACK indicating that we got/processed the message(s).
    // Do so if we've received a message to process or if we were waiting
    // before but a received ACK has cleared our waiting bit, and we have
    // more messages to send. Performing this operation causes additional
    // messages to be sent.
    if (nonAckReceived ||
        (noLongerWaiting && channel.queue.length > 0)) {
      var from = (fromFrameId === '..') ? OpenAjax.gadgets.rpc.RPC_ID : '..';
      callRmr(fromFrameId, OpenAjax.gadgets.rpc.ACK, from, {ackAlone: nonAckReceived});
    }
  }

  /**
   * Registers the RMR channel handler for the given frameId and associated
   * channel window.
   *
   * @param {string} frameId The ID of the frame for which this channel is being
   *   registered.
   * @param {Object} channelWindow The window of the receive frame for this
   *   channel, if any.
   *
   * @return {boolean} True if the frame was setup successfully, false
   *   otherwise.
   */
  function registerRmrChannel(frameId, channelWindow) {
    var channel = rmr_channels[frameId];

    // Verify that the channel is ready for receiving.
    try {
      var canAccess = false;

      // Check to see if the document is in the window. For Chrome, this
      // will return 'false' if the channelWindow is inaccessible by this
      // piece of JavaScript code, meaning that the URL of the channelWindow's
      // parent iframe has not yet changed from 'about:blank'. We do this
      // check this way because any true *access* on the channelWindow object
      // will raise a security exception, which, despite the try-catch, still
      // gets reported to the debugger (it does not break execution, the try
      // handles that problem, but it is still reported, which is bad form).
      // This check always succeeds in Safari 3.1 regardless of the state of
      // the window.
      canAccess = 'document' in channelWindow;

      if (!canAccess) {
        return false;
      }

      // Check to see if the document is an object. For Safari 3.1, this will
      // return undefined if the page is still inaccessible. Unfortunately, this
      // *will* raise a security issue in the debugger.
      // TODO Find a way around this problem.
      canAccess = typeof channelWindow['document'] == 'object';

      if (!canAccess) {
        return false;
      }

      // Once we get here, we know we can access the document (and anything else)
      // on the window object. Therefore, we check to see if the location is
      // still about:blank (this takes care of the Safari 3.2 case).
      var loc = channelWindow.location.href;

      // Check if this is about:blank for Safari.
      if (loc === 'about:blank') {
        return false;
      }
    } catch (ex) {
      // For some reason, the iframe still points to about:blank. We try
      // again in a bit.
      return false;
    }

    // Save a reference to the receive window.
    channel.receiveWindow = channelWindow;

    // Register the onresize handler.
    function onresize() {
      processRmrData(frameId);
    };

    if (typeof channelWindow.attachEvent === "undefined") {
      channelWindow.onresize = onresize;
    } else {
      channelWindow.attachEvent("onresize", onresize);
    }

    if (frameId === '..') {
      // Gadget to container. Signal to the container that the gadget
      // is ready to receive messages by attaching the g -> c relay.
      // As a nice optimization, pass along any gadget to container
      // queued messages that have backed up since then. ACK is enqueued in
      // getRmrData to ensure that the container's waiting flag is set to false
      // (this happens in the below code run on the container side).
      appendRmrFrame(channel.frame, channel.relayUri, getRmrData(frameId), frameId);
    } else {
      // Process messages that the gadget sent in its initial relay payload.
      // We can do this immediately because the container has already appended
      // and loaded a relay frame that can be used to ACK the messages the gadget
      // sent. In the preceding if-block, however, the processRmrData(...) call
      // must wait. That's because appendRmrFrame may not actually append the
      // frame - in the context of a gadget, this code may be running in the
      // head element, so it cannot be appended to body. As a result, the
      // gadget cannot ACK the container for messages it received.
      processRmrData(frameId);
    }

    return true;
  }

  return {
    getCode: function() {
      return 'rmr';
    },

    isParentVerifiable: function() {
      return true;
    },

    init: function(processFn, readyFn) {
      // No global setup.
      process = processFn;
      ready = readyFn;
      return true;
    },

    setup: function(receiverId, token) {
      try {
        setupRmr(receiverId);
      } catch (e) {
        OpenAjax.gadgets.warn('Caught exception setting up RMR: ' + e);
        return false;
      }
      return true;
    },

    call: function(targetId, from, rpc) {
      return callRmr(targetId, rpc.s, from, rpc);
    }
  };
}();

} // !end of double-inclusion guard

return OpenAjax;
});

/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */

define('OpenAjax/containers/iframe/rpc/wpm.transport',[
    'OpenAjax/hub/hub',
    'OpenAjax/containers/inline/inline',
    'OpenAjax/containers/iframe/iframe',
    'OpenAjax/containers/iframe/crypto',
    'OpenAjax/containers/iframe/json2',
    'OpenAjax/containers/iframe/rpc/rpc-dependencies',
    'OpenAjax/containers/iframe/rpc/fe.transport',
    'OpenAjax/containers/iframe/rpc/ifpc.transport',
    'OpenAjax/containers/iframe/rpc/rmr.transport'
], function( OpenAjax ){

OpenAjax.gadgets.rpctx = OpenAjax.gadgets.rpctx || {};

/**
 * Transport for browsers that support native messaging (various implementations
 * of the HTML5 postMessage method). Officially defined at
 * http://www.whatwg.org/specs/web-apps/current-work/multipage/comms.html.
 *
 * postMessage is a native implementation of XDC. A page registers that
 * it would like to receive messages by listening the the "message" event
 * on the window (document in DPM) object. In turn, another page can
 * raise that event by calling window.postMessage (document.postMessage
 * in DPM) with a string representing the message and a string
 * indicating on which domain the receiving page must be to receive
 * the message. The target page will then have its "message" event raised
 * if the domain matches and can, in turn, check the origin of the message
 * and process the data contained within.
 *
 *   wpm: postMessage on the window object.
 *      - Internet Explorer 8+
 *      - Safari 4+
 *      - Chrome 2+
 *      - Webkit nightlies
 *      - Firefox 3+
 *      - Opera 9+
 */
if (!OpenAjax.gadgets.rpctx.wpm) {  // make lib resilient to double-inclusion

OpenAjax.gadgets.rpctx.wpm = function() {
  var process, ready;
  var postMessage;
  var pmSync = false;
  var pmEventDomain = false;

  // Some browsers (IE, Opera) have an implementation of postMessage that is
  // synchronous, although HTML5 specifies that it should be asynchronous.  In
  // order to make all browsers behave consistently, we run a small test to detect
  // if postMessage is asynchronous or not.  If not, we wrap calls to postMessage
  // in a setTimeout with a timeout of 0.
  // Also, Opera's "message" event does not have an "origin" property (at least,
  // it doesn't in version 9.64;  presumably, it will in version 10).  If
  // event.origin does not exist, use event.domain.  The other difference is that
  // while event.origin looks like <scheme>://<hostname>:<port>, event.domain
  // consists only of <hostname>.
  //
  function testPostMessage() {
    var hit = false;
    
    function receiveMsg(event) {
      if (event.data == "postmessage.test") {
        hit = true;
        if (typeof event.origin === "undefined") {
          pmEventDomain = true;
        }
      }
    }
    
    OpenAjax.gadgets.util.attachBrowserEvent(window, "message", receiveMsg, false);
    window.postMessage("postmessage.test", "*");
    
    // if 'hit' is true here, then postMessage is synchronous
    if (hit) {
      pmSync = true;
    }
    
    OpenAjax.gadgets.util.removeBrowserEvent(window, "message", receiveMsg, false);
  }

  function onmessage(packet) {
    var rpc = OpenAjax.gadgets.json.parse(packet.data);
    if (!rpc || !rpc.f) {
      return;
    }
    
    // for security, check origin against expected value
    var origRelay = OpenAjax.gadgets.rpc.getRelayUrl(rpc.f) ||
                    OpenAjax.gadgets.util.getUrlParameters()["parent"];
    var origin = OpenAjax.gadgets.rpc.getOrigin(origRelay);
    if (!pmEventDomain ? packet.origin !== origin :
                         packet.domain !== /^.+:\/\/([^:]+).*/.exec( origin )[1]) {
      return;
    }

    process(rpc);
  }

  return {
    getCode: function() {
      return 'wpm';
    },

    isParentVerifiable: function() {
      return true;
    },

    init: function(processFn, readyFn) {
      process = processFn;
      ready = readyFn;

      testPostMessage();
      if (!pmSync) {
        postMessage = function(win, msg, origin) {
          win.postMessage(msg, origin);
        };
      } else {
        postMessage = function(win, msg, origin) {
          window.setTimeout( function() {
            win.postMessage(msg, origin);
          }, 0);
        };
      }
 
      // Set up native postMessage handler.
      OpenAjax.gadgets.util.attachBrowserEvent(window, 'message', onmessage, false);

      ready('..', true);  // Immediately ready to send to parent.
      return true;
    },

    setup: function(receiverId, token, forcesecure) {
      // If we're a gadget, send an ACK message to indicate to container
      // that we're ready to receive messages.
      if (receiverId === '..') {
        if (forcesecure) {
          OpenAjax.gadgets.rpc._createRelayIframe(token);
        } else {
          OpenAjax.gadgets.rpc.call(receiverId, OpenAjax.gadgets.rpc.ACK);
        }
      }
      return true;
    },

    call: function(targetId, from, rpc) {
      var targetWin = OpenAjax.gadgets.rpc._getTargetWin(targetId);
      // targetOrigin = canonicalized relay URL
      var origRelay = OpenAjax.gadgets.rpc.getRelayUrl(targetId) ||
                      OpenAjax.gadgets.util.getUrlParameters()["parent"];
      var origin = OpenAjax.gadgets.rpc.getOrigin(origRelay);
      if (origin) {
        postMessage(targetWin, OpenAjax.gadgets.json.stringify(rpc), origin);
      } else {
        OpenAjax.gadgets.error("No relay set (used as window.postMessage targetOrigin)" +
            ", cannot send cross-domain message");
      }
      return true;
    },

    relayOnload: function(receiverId, data) {
      ready(receiverId, true);
    }
  };
}();

} // !end of double-inclusion guard

return OpenAjax;
});

/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */

define('OpenAjax/containers/iframe/rpc/rpc',[
  'OpenAjax/hub/hub',
  'OpenAjax/containers/inline/inline',
  'OpenAjax/containers/iframe/iframe',
  'OpenAjax/containers/iframe/crypto',
  'OpenAjax/containers/iframe/json2',
  'OpenAjax/containers/iframe/rpc/rpc-dependencies',
  'OpenAjax/containers/iframe/rpc/fe.transport',
  'OpenAjax/containers/iframe/rpc/ifpc.transport',
  'OpenAjax/containers/iframe/rpc/rmr.transport',
  'OpenAjax/containers/iframe/rpc/wpm.transport'
], function( OpenAjax ){

/**
 * @fileoverview Remote procedure call library for gadget-to-container,
 * container-to-gadget, and gadget-to-gadget (thru container) communication.
 */

/**
 * gadgets.rpc Transports
 *
 * All transports are stored in object gadgets.rpctx, and are provided
 * to the core gadgets.rpc library by various build rules.
 * 
 * Transports used by core gadgets.rpc code to actually pass messages.
 * each transport implements the same interface exposing hooks that
 * the core library calls at strategic points to set up and use
 * the transport.
 *
 * The methods each transport must implement are:
 * + getCode(): returns a string identifying the transport. For debugging.
 * + isParentVerifiable(): indicates (via boolean) whether the method
 *     has the property that its relay URL verifies for certain the
 *     receiver's protocol://host:port.
 * + init(processFn, readyFn): Performs any global initialization needed. Called
 *     before any other gadgets.rpc methods are invoked. processFn is
 *     the function in gadgets.rpc used to process an rpc packet. readyFn is
 *     a function that must be called when the transport is ready to send
 *     and receive messages bidirectionally. Returns
 *     true if successful, false otherwise.
 * + setup(receiverId, token): Performs per-receiver initialization, if any.
 *     receiverId will be '..' for gadget-to-container. Returns true if
 *     successful, false otherwise.
 * + call(targetId, from, rpc): Invoked to send an actual
 *     message to the given targetId, with the given serviceName, from
 *     the sender identified by 'from'. Payload is an rpc packet. Returns
 *     true if successful, false otherwise.
 */

if (!OpenAjax.gadgets.rpc) { // make lib resilient to double-inclusion

/**
 * @static
 * @namespace Provides operations for making rpc calls.
 * @name gadgets.rpc
 */

OpenAjax.gadgets.rpc = function() {
  /** 
   * @const
   * @private
   */
  var CALLBACK_NAME = '__cb';

  /** 
   * @const
   * @private
   */
  var DEFAULT_NAME = '';

  /** Exported constant, for use by transports only.
   * @const
   * @type {string}
   * @member gadgets.rpc
   */
  var ACK = '__ack';

  /** 
   * Timeout and number of attempts made to setup a transport receiver.
   * @const
   * @private
   */
  var SETUP_FRAME_TIMEOUT = 500;

  /** 
   * @const
   * @private
   */
  var SETUP_FRAME_MAX_TRIES = 10;

  var services = {};
  var relayUrl = {};
  var useLegacyProtocol = {};
  var authToken = {};
  var callId = 0;
  var callbacks = {};
  var setup = {};
  var sameDomain = {};
  var params = {};
  var receiverTx = {};
  var earlyRpcQueue = {};

  // isGadget =~ isChild for the purposes of rpc (used only in setup).
  var isChild = (window.top !== window.self);

  // Set the current rpc ID from window.name immediately, to prevent
  // shadowing of window.name by a "var name" declaration, or similar.
  var rpcId = window.name;

  var securityCallback = function() {};
  var LOAD_TIMEOUT = 0;
  var FRAME_PHISH = 1;
  var FORGED_MSG = 2;

  // Fallback transport is simply a dummy impl that emits no errors
  // and logs info on calls it receives, to avoid undesired side-effects
  // from falling back to IFPC or some other transport.
  var fallbackTransport = (function() {
    function logFn(name) {
      return function() {
        OpenAjax.gadgets.log("gadgets.rpc." + name + "(" +
                    OpenAjax.gadgets.json.stringify(Array.prototype.slice.call(arguments)) +
                    "): call ignored. [caller: " + document.location +
                    ", isChild: " + isChild + "]");
      };
    }
    return {
      getCode: function() {
        return "noop";
      },
      isParentVerifiable: function() {
        return true;  // Not really, but prevents transport assignment to IFPC.
      },
      init: logFn("init"),
      setup: logFn("setup"),
      call: logFn("call")
    };
  })();

  // Load the authentication token for speaking to the container
  // from the gadget's parameters, or default to '0' if not found.
  if (OpenAjax.gadgets.util) {
    params = OpenAjax.gadgets.util.getUrlParameters();
  }

  /**
   * Return a transport representing the best available cross-domain
   * message-passing mechanism available to the browser.
   *
   * <p>Transports are selected on a cascading basis determined by browser
   * capability and other checks. The order of preference is:
   * <ol>
   * <li> wpm: Uses window.postMessage standard.
   * <li> dpm: Uses document.postMessage, similar to wpm but pre-standard.
   * <li> nix: Uses IE-specific browser hacks.
   * <li> rmr: Signals message passing using relay file's onresize handler.
   * <li> fe: Uses FF2-specific window.frameElement hack.
   * <li> ifpc: Sends messages via active load of a relay file.
   * </ol>
   * <p>See each transport's commentary/documentation for details.
   * @return {Object}
   * @member gadgets.rpc
   */
  function getTransport() {
    return typeof window.postMessage === 'function' ? OpenAjax.gadgets.rpctx.wpm :
           typeof window.postMessage === 'object' ? OpenAjax.gadgets.rpctx.wpm :
//           window.ActiveXObject ? OpenAjax.gadgets.rpctx.nix :
           navigator.userAgent.indexOf('WebKit') > 0 ? OpenAjax.gadgets.rpctx.rmr :
           navigator.product === 'Gecko' ? OpenAjax.gadgets.rpctx.frameElement :
           OpenAjax.gadgets.rpctx.ifpc;
  }

  /**
   * Function passed to, and called by, a transport indicating it's ready to
   * send and receive messages.
   */
  function transportReady(receiverId, readySuccess) {
    var tx = transport;
    if (!readySuccess) {
      tx = fallbackTransport;
    }
    receiverTx[receiverId] = tx;

    // If there are any early-queued messages, send them now directly through
    // the needed transport.
    var earlyQueue = earlyRpcQueue[receiverId] || [];
    for (var i = 0; i < earlyQueue.length; ++i) {
      var rpc = earlyQueue[i];
      // There was no auth/rpc token set before, so set it now.
      rpc.t = getAuthToken(receiverId);
      tx.call(receiverId, rpc.f, rpc);
    }

    // Clear the queue so it won't be sent again.
    earlyRpcQueue[receiverId] = [];
  }

  //  Track when this main page is closed or navigated to a different location
  // ("unload" event).
  //  NOTE: The use of the "unload" handler here and for the relay iframe
  // prevents the use of the in-memory page cache in modern browsers.
  // See: https://developer.mozilla.org/en/using_firefox_1.5_caching
  // See: http://webkit.org/blog/516/webkit-page-cache-ii-the-unload-event/
  var mainPageUnloading = false,
      hookedUnload = false;
  
  function hookMainPageUnload() {
    if ( hookedUnload ) {
      return;
    }
    function onunload() {
      mainPageUnloading = true;
    }
    OpenAjax.gadgets.util.attachBrowserEvent(window, 'unload', onunload, false);
    hookedUnload = true;
  }

  function relayOnload(targetId, sourceId, token, data, relayWindow) {
    // Validate auth token.
    if (!authToken[sourceId] || authToken[sourceId] !== token) {
      OpenAjax.gadgets.error("Invalid auth token. " + authToken[sourceId] + " vs " + token);
      securityCallback(sourceId, FORGED_MSG);
    }
    
    relayWindow.onunload = function() {
      if (setup[sourceId] && !mainPageUnloading) {
        securityCallback(sourceId, FRAME_PHISH);
        OpenAjax.gadgets.rpc.removeReceiver(sourceId);
      }
    };
    hookMainPageUnload();
    
    data = OpenAjax.gadgets.json.parse(decodeURIComponent(data));
    transport.relayOnload(sourceId, data);
  }

  /**
   * Helper function to process an RPC request
   * @param {Object} rpc RPC request object
   * @private
   */
  function process(rpc) {
    //
    // RPC object contents:
    //   s: Service Name
    //   f: From
    //   c: The callback ID or 0 if none.
    //   a: The arguments for this RPC call.
    //   t: The authentication token.
    //
    if (rpc && typeof rpc.s === 'string' && typeof rpc.f === 'string' &&
        rpc.a instanceof Array) {

      // Validate auth token.
      if (authToken[rpc.f]) {
        // We don't do type coercion here because all entries in the authToken
        // object are strings, as are all url params. See setupReceiver(...).
        if (authToken[rpc.f] !== rpc.t) {
          OpenAjax.gadgets.error("Invalid auth token. " + authToken[rpc.f] + " vs " + rpc.t);
          securityCallback(rpc.f, FORGED_MSG);
        }
      }

      if (rpc.s === ACK) {
        // Acknowledgement API, used to indicate a receiver is ready.
        window.setTimeout(function() { transportReady(rpc.f, true); }, 0);
        return;
      }

      // If there is a callback for this service, attach a callback function
      // to the rpc context object for asynchronous rpc services.
      //
      // Synchronous rpc request handlers should simply ignore it and return a
      // value as usual.
      // Asynchronous rpc request handlers, on the other hand, should pass its
      // result to this callback function and not return a value on exit.
      //
      // For example, the following rpc handler passes the first parameter back
      // to its rpc client with a one-second delay.
      //
      // function asyncRpcHandler(param) {
      //   var me = this;
      //   setTimeout(function() {
      //     me.callback(param);
      //   }, 1000);
      // }
      if (rpc.c) {
        rpc.callback = function(result) {
          OpenAjax.gadgets.rpc.call(rpc.f, CALLBACK_NAME, null, rpc.c, result);
        };
      }

      // Call the requested RPC service.
      var result = (services[rpc.s] ||
                    services[DEFAULT_NAME]).apply(rpc, rpc.a);

      // If the rpc request handler returns a value, immediately pass it back
      // to the callback. Otherwise, do nothing, assuming that the rpc handler
      // will make an asynchronous call later.
      if (rpc.c && typeof result !== 'undefined') {
        OpenAjax.gadgets.rpc.call(rpc.f, CALLBACK_NAME, null, rpc.c, result);
      }
    }
  }

  /**
   * Helper method returning a canonicalized protocol://host[:port] for
   * a given input URL, provided as a string. Used to compute convenient
   * relay URLs and to determine whether a call is coming from the same
   * domain as its receiver (bypassing the try/catch capability detection
   * flow, thereby obviating Firebug and other tools reporting an exception).
   *
   * @param {string} url Base URL to canonicalize.
   * @memberOf gadgets.rpc
   */

  function getOrigin(url) {
    if (!url) {
      return "";
    }
    url = url.toLowerCase();
    if (url.indexOf("//") == 0) {
      url = window.location.protocol + url;
    }
    if (url.indexOf("://") == -1) {
      // Assumed to be schemaless. Default to current protocol.
      url = window.location.protocol + "//" + url;
    }
    // At this point we guarantee that "://" is in the URL and defines
    // current protocol. Skip past this to search for host:port.
    var host = url.substring(url.indexOf("://") + 3);

    // Find the first slash char, delimiting the host:port.
    var slashPos = host.indexOf("/");
    if (slashPos != -1) {
      host = host.substring(0, slashPos);
    }

    var protocol = url.substring(0, url.indexOf("://"));

    // Use port only if it's not default for the protocol.
    var portStr = "";
    var portPos = host.indexOf(":");
    if (portPos != -1) {
      var port = host.substring(portPos + 1);
      host = host.substring(0, portPos);
      if ((protocol === "http" && port !== "80") ||
          (protocol === "https" && port !== "443")) {
        portStr = ":" + port;
      }
    }

    // Return <protocol>://<host>[<port>]
    return protocol + "://" + host + portStr;
  }

  function getTargetWin(id) {
    if (typeof id === "undefined" ||
        id === "..") {
      return window.parent;
    }

    // Cast to a String to avoid an index lookup.
    id = String(id);
    
    // Try window.frames first
    var target = window.frames[id];
    if (target) {
      return target;
    }
    
    // Fall back to getElementById()
    target = document.getElementById(id);
    if (target && target.contentWindow) {
      return target.contentWindow;
    }

    return null;
  }

  // Pick the most efficient RPC relay mechanism.
  var transport = getTransport();

  // Create the Default RPC handler.
  services[DEFAULT_NAME] = function() {
    OpenAjax.gadgets.warn('Unknown RPC service: ' + this.s);
  };

  // Create a Special RPC handler for callbacks.
  services[CALLBACK_NAME] = function(callbackId, result) {
    var callback = callbacks[callbackId];
    if (callback) {
      delete callbacks[callbackId];
      callback(result);
    }
  };

  /**
   * Conducts any frame-specific work necessary to setup
   * the channel type chosen. This method is called when
   * the container page first registers the gadget in the
   * RPC mechanism. Gadgets, in turn, will complete the setup
   * of the channel once they send their first messages.
   */
  function setupFrame(frameId, token, forcesecure) {
    if (setup[frameId] === true) {
      return;
    }

    if (typeof setup[frameId] === 'undefined') {
      setup[frameId] = 0;
    }

    var tgtFrame = document.getElementById(frameId);
    if (frameId === '..' || tgtFrame != null) {
      if (transport.setup(frameId, token, forcesecure) === true) {
        setup[frameId] = true;
        return;
      }
    }

    if (setup[frameId] !== true && setup[frameId]++ < SETUP_FRAME_MAX_TRIES) {
      // Try again in a bit, assuming that frame will soon exist.
      window.setTimeout(function() { setupFrame(frameId, token, forcesecure) },
                        SETUP_FRAME_TIMEOUT);
    } else {
      // Fail: fall back for this gadget.
      receiverTx[frameId] = fallbackTransport;
      setup[frameId] = true;
    }
  }

  /**
   * Attempts to make an rpc by calling the target's receive method directly.
   * This works when gadgets are rendered on the same domain as their container,
   * a potentially useful optimization for trusted content which keeps
   * RPC behind a consistent interface.
   *
   * @param {string} target Module id of the rpc service provider
   * @param {Object} rpc RPC data
   * @return {boolean}
   */
  function callSameDomain(target, rpc) {
    if (typeof sameDomain[target] === 'undefined') {
      // Seed with a negative, typed value to avoid
      // hitting this code path repeatedly.
      sameDomain[target] = false;
      var targetRelay = OpenAjax.gadgets.rpc.getRelayUrl(target);
      if (getOrigin(targetRelay) !== getOrigin(window.location.href)) {
        // Not worth trying -- avoid the error and just return.
        return false;
      }

      var targetEl = getTargetWin(target);
      try {
        // If this succeeds, then same-domain policy applied
        sameDomain[target] = targetEl.OpenAjax.gadgets.rpc.receiveSameDomain;
      } catch (e) {
        // Shouldn't happen due to origin check. Caught to emit
        // more meaningful error to the caller.
        OpenAjax.gadgets.error("Same domain call failed: parent= incorrectly set.");
      }
    }

    if (typeof sameDomain[target] === 'function') {
      // Call target's receive method
      sameDomain[target](rpc);
      return true;
    }

    return false;
  }

  /**
   * Sets the relay URL of a target frame.
   * @param {string} targetId Name of the target frame.
   * @param {string} url Full relay URL of the target frame.
   * @param {boolean=} opt_useLegacy True if this relay needs the legacy IFPC
   *     wire format.
   *
   * @member gadgets.rpc
   * @deprecated
   */
  function setRelayUrl(targetId, url, opt_useLegacy) {
    // make URL absolute if necessary
    if (!/http(s)?:\/\/.+/.test(url)) {
      if (url.indexOf("//") == 0) {
        url = window.location.protocol + url;
      } else if (url.charAt(0) == '/') {
        url = window.location.protocol + "//" + window.location.host + url;
      } else if (url.indexOf("://") == -1) {
        // Assumed to be schemaless. Default to current protocol.
        url = window.location.protocol + "//" + url;
      }
    }
    relayUrl[targetId] = url;
    useLegacyProtocol[targetId] = !!opt_useLegacy;
  }

  /**
   * Helper method to retrieve the authToken for a given gadget.
   * Not to be used directly.
   * @member gadgets.rpc
   * @return {string}
   */
  function getAuthToken(targetId) {
    return authToken[targetId];
  }

  /**
   * Sets the auth token of a target frame.
   * @param {string} targetId Name of the target frame.
   * @param {string} token The authentication token to use for all
   *     calls to or from this target id.
   *
   * @member gadgets.rpc
   * @deprecated
   */
  function setAuthToken(targetId, token, forcesecure) {
    token = token || "";

    // Coerce token to a String, ensuring that all authToken values
    // are strings. This ensures correct comparison with URL params
    // in the process(rpc) method.
    authToken[targetId] = String(token);

    setupFrame(targetId, token, forcesecure);
  }

  function setupContainerGadgetContext(rpctoken, opt_forcesecure) {
    /**
     * Initializes gadget to container RPC params from the provided configuration.
     */
    function init(config) {
      var configRpc = config ? config.rpc : {};
      var parentRelayUrl = configRpc.parentRelayUrl;

      // Allow for wild card parent relay files as long as it's from a
      // white listed domain. This is enforced by the rendering servlet.
      if (parentRelayUrl.substring(0, 7) !== 'http://' &&
          parentRelayUrl.substring(0, 8) !== 'https://' &&
          parentRelayUrl.substring(0, 2) !== '//') {
        // Relative path: we append to the parent.
        // We're relying on the server validating the parent parameter in this
        // case. Because of this, parent may only be passed in the query, not fragment.
        if (typeof params.parent === "string" && params.parent !== "") {
          // Otherwise, relayUrl['..'] will be null, signaling transport
          // code to ignore rpc calls since they cannot work without a
          // relay URL with host qualification.
          if (parentRelayUrl.substring(0, 1) !== '/') {
            // Path-relative. Trust that parent is passed in appropriately.
            var lastSlash = params.parent.lastIndexOf('/');
            parentRelayUrl = params.parent.substring(0, lastSlash + 1) + parentRelayUrl;
          } else {
            // Host-relative.
            parentRelayUrl = getOrigin(params.parent) + parentRelayUrl;
          }
        }
      }

      var useLegacy = !!configRpc.useLegacyProtocol;
      setRelayUrl('..', parentRelayUrl, useLegacy);

      if (useLegacy) {
        transport = OpenAjax.gadgets.rpctx.ifpc;
        transport.init(process, transportReady);
      }

      // Sets the auth token and signals transport to setup connection to container.
      var forceSecure = opt_forcesecure || params.forcesecure || false;
      setAuthToken('..', rpctoken, forceSecure);
    }

    var requiredConfig = {
      parentRelayUrl : OpenAjax.gadgets.config.NonEmptyStringValidator
    };
    OpenAjax.gadgets.config.register("rpc", requiredConfig, init);
  }

  function setupContainerGenericIframe(rpctoken, opt_parent, opt_forcesecure) {
    // Generic child IFRAME setting up connection w/ its container.
    // Use the opt_parent param if provided, or the "parent" query param
    // if found -- otherwise, do nothing since this call might be initiated
    // automatically at first, then actively later in IFRAME code.
    var forcesecure = opt_forcesecure || params.forcesecure || false;
    var parent = opt_parent || params.parent;
    if (parent) {
      setRelayUrl('..', parent);
      setAuthToken('..', rpctoken, forcesecure);
    }
  }

  function setupChildIframe(gadgetId, opt_frameurl, opt_authtoken, opt_forcesecure) {
    if (!OpenAjax.gadgets.util) {
      return;
    }
    var childIframe = document.getElementById(gadgetId);
    if (!childIframe) {
      throw new Error("Cannot set up gadgets.rpc receiver with ID: " + gadgetId +
          ", element not found.");
    }

    // The "relay URL" can either be explicitly specified or is set as
    // the child IFRAME URL verbatim.
    var relayUrl = opt_frameurl || childIframe.src;
    setRelayUrl(gadgetId, relayUrl);

    // The auth token is parsed from child params (rpctoken) or overridden.
    var childParams = OpenAjax.gadgets.util.getUrlParameters(childIframe.src);
    var rpctoken = opt_authtoken || childParams.rpctoken;
    var forcesecure = opt_forcesecure || childParams.forcesecure;
    setAuthToken(gadgetId, rpctoken, forcesecure);
  }

  /**
   * Sets up the gadgets.rpc library to communicate with the receiver.
   * <p>This method replaces setRelayUrl(...) and setAuthToken(...)
   *
   * <p>Simplified instructions - highly recommended:
   * <ol>
   * <li> Generate &lt;iframe id="&lt;ID&gt;" src="...#parent=&lt;PARENTURL&gt;&rpctoken=&lt;RANDOM&gt;"/&gt;
   *      and add to DOM.
   * <li> Call gadgets.rpc.setupReceiver("&lt;ID>");
   *      <p>All parent/child communication initializes automatically from here.
   *         Naturally, both sides need to include the library.
   * </ol>
   *
   * <p>Detailed container/parent instructions:
   * <ol>
   * <li> Create the target IFRAME (eg. gadget) with a given &lt;ID> and params
   *    rpctoken=<token> (eg. #rpctoken=1234), which is a random/unguessbable
   *    string, and parent=&lt;url>, where &lt;url> is the URL of the container.
   * <li> Append IFRAME to the document.
   * <li> Call gadgets.rpc.setupReceiver(&lt;ID>)
   * <p>[Optional]. Strictly speaking, you may omit rpctoken and parent. This
   *             practice earns little but is occasionally useful for testing.
   *             If you omit parent, you MUST pass your container URL as the 2nd
   *             parameter to this method.
   * </ol>
   *
   * <p>Detailed gadget/child IFRAME instructions:
   * <ol>
   * <li> If your container/parent passed parent and rpctoken params (query string
   *    or fragment are both OK), you needn't do anything. The library will self-
   *    initialize.
   * <li> If "parent" is omitted, you MUST call this method with targetId '..'
   *    and the second param set to the parent URL.
   * <li> If "rpctoken" is omitted, but the container set an authToken manually
   *    for this frame, you MUST pass that ID (however acquired) as the 2nd param
   *    to this method.
   * </ol>
   *
   * @member gadgets.rpc
   * @param {string} targetId
   * @param {string=} opt_receiverurl
   * @param {string=} opt_authtoken
   * @param {boolean=} opt_forcesecure
   */
  function setupReceiver(targetId, opt_receiverurl, opt_authtoken, opt_forcesecure) {
    if (targetId === '..') {
      // Gadget/IFRAME to container.
      var rpctoken = opt_authtoken || params.rpctoken || params.ifpctok || "";
      if (window['__isgadget'] === true) {
        setupContainerGadgetContext(rpctoken, opt_forcesecure);
      } else {
        setupContainerGenericIframe(rpctoken, opt_receiverurl, opt_forcesecure);
      }
    } else {
      // Container to child.
      setupChildIframe(targetId, opt_receiverurl, opt_authtoken, opt_forcesecure);
    }
  }

  return /** @scope gadgets.rpc */ {
    config: function(config) {
      if (typeof config.securityCallback === 'function') {
        securityCallback = config.securityCallback;
      }
    },
    
    /**
     * Registers an RPC service.
     * @param {string} serviceName Service name to register.
     * @param {function(Object,Object)} handler Service handler.
     *
     * @member gadgets.rpc
     */
    register: function(serviceName, handler) {
      if (serviceName === CALLBACK_NAME || serviceName === ACK) {
        throw new Error("Cannot overwrite callback/ack service");
      }

      if (serviceName === DEFAULT_NAME) {
        throw new Error("Cannot overwrite default service:"
                        + " use registerDefault");
      }

      services[serviceName] = handler;
    },

    /**
     * Unregisters an RPC service.
     * @param {string} serviceName Service name to unregister.
     *
     * @member gadgets.rpc
     */
    unregister: function(serviceName) {
      if (serviceName === CALLBACK_NAME || serviceName === ACK) {
        throw new Error("Cannot delete callback/ack service");
      }

      if (serviceName === DEFAULT_NAME) {
        throw new Error("Cannot delete default service:"
                        + " use unregisterDefault");
      }

      delete services[serviceName];
    },

    /**
     * Registers a default service handler to processes all unknown
     * RPC calls which raise an exception by default.
     * @param {function(Object,Object)} handler Service handler.
     *
     * @member gadgets.rpc
     */
    registerDefault: function(handler) {
      services[DEFAULT_NAME] = handler;
    },

    /**
     * Unregisters the default service handler. Future unknown RPC
     * calls will fail silently.
     *
     * @member gadgets.rpc
     */
    unregisterDefault: function() {
      delete services[DEFAULT_NAME];
    },

    /**
     * Forces all subsequent calls to be made by a transport
     * method that allows the caller to verify the message receiver
     * (by way of the parent parameter, through getRelayUrl(...)).
     * At present this means IFPC or WPM.
     * @member gadgets.rpc
     */
    forceParentVerifiable: function() {
      if (!transport.isParentVerifiable()) {
        transport = OpenAjax.gadgets.rpctx.ifpc;
      }
    },

    /**
     * Calls an RPC service.
     * @param {string} targetId Module Id of the RPC service provider.
     *                          Empty if calling the parent container.
     * @param {string} serviceName Service name to call.
     * @param {function()|null} callback Callback function (if any) to process
     *                                 the return value of the RPC request.
     * @param {*} var_args Parameters for the RPC request.
     *
     * @member gadgets.rpc
     */
    call: function(targetId, serviceName, callback, var_args) {
      targetId = targetId || '..';
      // Default to the container calling.
      var from = '..';

      if (targetId === '..') {
        from = rpcId;
      }

      ++callId;
      if (callback) {
        callbacks[callId] = callback;
      }

      var rpc = {
        s: serviceName,
        f: from,
        c: callback ? callId : 0,
        a: Array.prototype.slice.call(arguments, 3),
        t: authToken[targetId],
        l: useLegacyProtocol[targetId]
      };

      if (targetId !== '..' && !document.getElementById(targetId)) {
        // The target has been removed from the DOM. Don't even try.
        OpenAjax.gadgets.log("WARNING: attempted send to nonexistent frame: " + targetId);
        return;
      }

      // If target is on the same domain, call method directly
      if (callSameDomain(targetId, rpc)) {
        return;
      }

      // Attempt to make call via a cross-domain transport.
      // Retrieve the transport for the given target - if one
      // target is misconfigured, it won't affect the others.
      var channel = receiverTx[targetId];

      if (!channel) {
        // Not set up yet. Enqueue the rpc for such time as it is.
        if (!earlyRpcQueue[targetId]) {
          earlyRpcQueue[targetId] = [ rpc ];
        } else {
          earlyRpcQueue[targetId].push(rpc);
        }
        return;
      }

      // If we are told to use the legacy format, then we must
      // default to IFPC.
      if (useLegacyProtocol[targetId]) {
        channel = OpenAjax.gadgets.rpctx.ifpc;
      }

      if (channel.call(targetId, from, rpc) === false) {
        // Fall back to IFPC. This behavior may be removed as IFPC is as well.
        receiverTx[targetId] = fallbackTransport;
        transport.call(targetId, from, rpc);
      }
    },

    /**
     * Gets the relay URL of a target frame.
     * @param {string} targetId Name of the target frame.
     * @return {string|undefined} Relay URL of the target frame.
     *
     * @member gadgets.rpc
     */
    getRelayUrl: function(targetId) {
      var url = relayUrl[targetId];
      // Some RPC methods (wpm, for one) are unhappy with schemeless URLs.
      if (url && url.substring(0,1) === '/') {
        if (url.substring(1,2) === '/') {    // starts with '//'
          url = document.location.protocol + url;
        } else {    // relative URL, starts with '/'
          url = document.location.protocol + '//' + document.location.host + url;
        }
      }
      
      return url;
    },

    setRelayUrl: setRelayUrl,
    setAuthToken: setAuthToken,
    setupReceiver: setupReceiver,
    getAuthToken: getAuthToken,
    
    // Note: Does not delete iframe
    removeReceiver: function(receiverId) {
      delete relayUrl[receiverId];
      delete useLegacyProtocol[receiverId];
      delete authToken[receiverId];
      delete setup[receiverId];
      delete sameDomain[receiverId];
      delete receiverTx[receiverId];
    },

    /**
     * Gets the RPC relay mechanism.
     * @return {string} RPC relay mechanism. See above for
     *   a list of supported types.
     *
     * @member gadgets.rpc
     */
    getRelayChannel: function() {
      return transport.getCode();
    },

    /**
     * Receives and processes an RPC request. (Not to be used directly.)
     * Only used by IFPC.
     * @param {Array.<string>} fragment An RPC request fragment encoded as
     *        an array. The first 4 elements are target id, source id & call id,
     *        total packet number, packet id. The last element stores the actual
     *        JSON-encoded and URI escaped packet data.
     *
     * @member gadgets.rpc
     * @deprecated
     */
    receive: function(fragment, otherWindow) {
      if (fragment.length > 4) {
        transport._receiveMessage(fragment, process);
      } else {
        relayOnload.apply(null, fragment.concat(otherWindow));
      }
    },

    /**
     * Receives and processes an RPC request sent via the same domain.
     * (Not to be used directly). Converts the inbound rpc object's
     * Array into a local Array to pass the process() Array test.
     * @param {Object} rpc RPC object containing all request params
     * @member gadgets.rpc
     */
    receiveSameDomain: function(rpc) {
      // Pass through to local process method but converting to a local Array
      rpc.a = Array.prototype.slice.call(rpc.a);
      window.setTimeout(function() { process(rpc); }, 0);
    },

    // Helper method to get the protocol://host:port of an input URL.
    // see docs above
    getOrigin: getOrigin,

    getReceiverOrigin: function(receiverId) {
      var channel = receiverTx[receiverId];
      if (!channel) {
        // not set up yet
        return null;
      }
      if (!channel.isParentVerifiable(receiverId)) {
        // given transport cannot verify receiver origin
        return null;
      }
      var origRelay = OpenAjax.gadgets.rpc.getRelayUrl(receiverId) ||
                      OpenAjax.gadgets.util.getUrlParameters().parent;
      return OpenAjax.gadgets.rpc.getOrigin(origRelay);
    },

    /**
     * Internal-only method used to initialize gadgets.rpc.
     * @member gadgets.rpc
     */
    init: function() {
      // Conduct any global setup necessary for the chosen transport.
      // Do so after gadgets.rpc definition to allow transport to access
      // gadgets.rpc methods.
      if (transport.init(process, transportReady) === false) {
        transport = fallbackTransport;
      }
      if (isChild) {
        setupReceiver('..');
      }
    },

    /** Returns the window keyed by the ID. null/".." for parent, else child */
    _getTargetWin: getTargetWin,

    /** Create an iframe for loading the relay URL. Used by child only. */ 
    _createRelayIframe: function(token, data) {
      var relay = OpenAjax.gadgets.rpc.getRelayUrl('..');
      if (!relay) {
        return;
      }
      
      // Format: #targetId & sourceId & authToken & data
      var src = relay + '#..&' + rpcId + '&' + token + '&' +
          encodeURIComponent(OpenAjax.gadgets.json.stringify(data));
  
      var iframe = document.createElement('iframe');
      iframe.style.border = iframe.style.width = iframe.style.height = '0px';
      iframe.style.visibility = 'hidden';
      iframe.style.position = 'absolute';

      function appendFn() {
        // Append the iframe.
        document.body.appendChild(iframe);
  
        // Set the src of the iframe to 'about:blank' first and then set it
        // to the relay URI. This prevents the iframe from maintaining a src
        // to the 'old' relay URI if the page is returned to from another.
        // In other words, this fixes the bfcache issue that causes the iframe's
        // src property to not be updated despite us assigning it a new value here.
        iframe.src = 'javascript:"<html></html>"';
        iframe.src = src;
      }
      
      if (document.body) {
        appendFn();
      } else {
        OpenAjax.gadgets.util.registerOnLoadHandler(function() { appendFn(); });
      }
      
      return iframe;
    },

    ACK: ACK,

    RPC_ID: rpcId,
    
    SEC_ERROR_LOAD_TIMEOUT: LOAD_TIMEOUT,
    SEC_ERROR_FRAME_PHISH: FRAME_PHISH,
    SEC_ERROR_FORGED_MSG : FORGED_MSG
  };
}();

// Initialize library/transport.
OpenAjax.gadgets.rpc.init();

} // !end of double-inclusion guard

return OpenAjax;
});

define('OpenAjax',[
	'OpenAjax/hub/hub',
	'OpenAjax/containers/inline/inline',
	'OpenAjax/containers/iframe/iframe',
	'OpenAjax/containers/iframe/crypto',
	'OpenAjax/containers/iframe/json2',
	'OpenAjax/containers/iframe/rpc/rpc-dependencies',
	'OpenAjax/containers/iframe/rpc/fe.transport',
	'OpenAjax/containers/iframe/rpc/ifpc.transport',
	'OpenAjax/containers/iframe/rpc/rmr.transport',
	'OpenAjax/containers/iframe/rpc/wpm.transport',
	'OpenAjax/containers/iframe/rpc/rpc'
], function( OpenAjax ){
	return OpenAjax;
});

define('scripts/core/open-ajax/open-ajax',[
	//'lib/openajax/release/all/OpenAjaxManagedHub-all'
	'OpenAjax'
], function( OpenAjax) {

	//window.OpenAjax = OpenAjax;
	return OpenAjax;
});
define( 'scripts/core/hub/hub',['scripts/core/open-ajax/open-ajax'], function(){

	var AnywareHub = (function() {

		var instance;

		function initialize() {

			//---- Private Scope ---------------------
			var eventChannel = "anyware";

			var getTopic = function( event ){
				return eventChannel + '.' + event;
			};

			var onHub = function() {
				return true;
			};

			var onHubSecurityAlert = function( /* source, alertType */ ) {

			};

			var hub = new OpenAjax.hub.ManagedHub({
				onPublish :         onHub,
				onSubscribe :       onHub,
				onUnsubscribe :     onHub,
				onSecurityAlert :   onHubSecurityAlert
			});

			//---- Public Scope ---------------------
			return {

				subscribe : function( eventName, callback ){
					return hub.subscribe( getTopic( eventName ), callback );
				},

				unsubscribe : function( subscription ){
					return hub.unsubscribe( subscription );
				},

				publish : function( event, data ){
					return hub.publish( getTopic( event ), data );
				},

				getMessageHub : function(){
					return hub;
				},

				removeContainer: function( container ) {
					return hub.removeContainer( container );
				}
			};
		}

		return {

			getInstance : function(){
				if( !instance ) {
					instance = initialize();
				}

				window.Adobe = window.Adobe || {};
				window.Adobe.Anyware = window.Adobe.Anyware || {};
				window.Adobe.Anyware.Hub = instance;

				return instance;
			}
		};

	}());


	return AnywareHub;

});



define( 'scripts/core/container/container',['jquery', 'scripts/core/hub/hub'] ,function( $, Hub ){

	var Container = function( componentName, element, clientUrl, pathToRelay, iframeAttrs, timeout ){

		this.init( componentName, element, clientUrl, pathToRelay, iframeAttrs, timeout );

	};

	Container.prototype = {

		hub : Hub.getInstance(),

		container : null,

		init: function( name, elem, clientUrl, relayPath, attrs, timeout ){

			var iframeAttrs;

			this.checkRequiredParams( name, elem, clientUrl );

			iframeAttrs = {
				'class': 'anyware-iframe',
				'style': { border: "none", width:"100%", height:"100%", overflow:"hidden", scroll:"no" },
				'allowTransparency': true,
				'frameborder': 0
			};
			$.extend( true, iframeAttrs, attrs);

			this.componentName = name;
			this.componentId = this.createComponentId( name );
			this.element = elem;
			this.clientUrl = clientUrl;
			this.tunnelUrl = this.getTunnelUrl( relayPath );
			this.iframeAttrs = iframeAttrs;
			this.timeout = timeout || 15000;
		},

		checkRequiredParams : function( name, elem, clientUrl  ) {
			if( !name || !elem || !clientUrl ){
				throw new Error( 'Expect element, clientUrl and handlers to be passed to constructor.');
			}
		},

		loadComponent : function( callback ){

			var hub = this.hub.getMessageHub(),
				self = this;

			this.container = ( new OpenAjax.hub.IframeContainer( hub, this.componentId,{
				Container : {
					onSecurityAlert: function( container, alertType ){
						if( container === self.container ) {
							$(self.element).trigger( 'errorEvent', { errorType: self.getSecurityErrorType( alertType ), errors: alertType });
						}
					},
					onConnect: function(){
						self.readyHandler = self.setUpReadyHandler( callback );
					},
					onDisconnect: function(){

					}
				},
				IframeContainer : {
					parent : this.element,
					iframeAttrs : this.iframeAttrs,
					uri : this.clientUrl,
					tunnelURI : this.tunnelUrl,
					timeout : this.timeout
				}
			}));
		},

		unloadComponent : function(){
			this.hub.removeContainer( this.container );
			this.container = null;
		},

		isConnected : function(){
			var connected = false;
			if( this.container ){
				connected = this.container.isConnected(); 
			}
			return connected;
		},

		subscribe : function( event, handler ){
			return this.hub.subscribe( this.getTopic( event ), handler );
		},

		unsubscribe : function( subscription ){
			this.hub.unsubscribe( subscription );
		},

		publish: function( event, data ){
			this.hub.publish( this.getTopic( event ), data );
		},

		getComponentId: function(){
			return this.container.getClientID();
		},

		getComponentName: function(){
			return this.componentName;
		},

		createComponentId: function( componentName ){
			var uid = Math.floor( Math.random() * 10000 );
			return componentName + '.' + uid;
		},

		getSecurityErrorType: function( type ){
			switch( type ){
				case OpenAjax.hub.SecurityAlert.LoadTimeout:
					type = 'APPLICATION_LOAD_FAILURE';
					break;

				default:
					type = 'CROSS_DOMAIN_SECURITY_ERROR';
			}

			return type;
		},

		setUpReadyHandler: function( readyCallback ){
			var self = this;
			return this.subscribe( 'applicationReady', function( event ){
				readyCallback.apply();
				self.removeReadyHandler();
			});
		},

		removeReadyHandler: function(){
			if( this.readyHandler ){
				this.unsubscribe( this.readyHandler );
				this.readyHandler = null;
			}
		},

		getTopic: function( event ){
			return this.componentId + '.' + event;
		},

		getTunnelUrl : function( pathToRelay ){

			var path,
				rootPath,
				fileName = 'rpc_relay.html',
				hostDomain = location.host,
				protocol = location.protocol;

			if( pathToRelay ) {
				path = pathToRelay;
			}
			else {
				rootPath = window.location.pathname;
				path = rootPath.substring( 0, rootPath.lastIndexOf('/')+1 ) + fileName;
			}

			return ( protocol + "//" + hostDomain + path );
		}

	};

	return Container;
});
define('scripts/components/common/models/configuration-model',[
	'jquery',
	'can',
	'can-proxy',
	'scripts/components/common/util/lang'
], function( $, can ){

	var configModel = can.Model.extend({

		domains: {
			"dev" : "store1.dev04.adobe.com",
			"pre-stage" : "store1.qa04.adobe.com",
			"stage" : "store1.stage.adobe.com",
			"prod" : "store1.adobe.com"
		},

		requiredAttrs : [ 'appId', 'clientId', 'countryCode', 'marketSegment' ],

		MISSING_REQUIRED_ATTRIBUTES : 'Missing required attributes: ',
		CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
		CLIENT_URL_UNAVAILABLE: 'CLIENT_URL_UNAVAILABLE'

	},{

		init: function(){
			var required = this.constructor.requiredAttrs,
				attr;

			for( var i=0; i < required.length; i++ ){
				attr = required[ i ];
				if( !this.attr( attr ) ){
					throw new Error(this.constructor.MISSING_REQUIRED_ATTRIBUTES + attr );
				}
			}
		},

		load : function( scope, success, error ){
			var params = this.attr();

			this.callbackScope = scope;
			this.successCallback = success;
			this.errorCallback = error;

			return $.ajax({
				url: this.getRequestUrl( params ),
				dataType: 'jsonp',
				jsonpCallback: this.getCallbackName( params ),
				success: this.proxy( 'handleLoadSuccess' ),
				error: this.proxy( 'handleLoadError' )
			});
		},

		handleLoadSuccess: function( responseData ){
			if( !this.isClientUrlAvailable( responseData ) ){
				var errorObj = { errorType: this.constructor.CLIENT_URL_UNAVAILABLE };
				this.doErrorCallback( errorObj );
			} else {
				var model = this.updateData( responseData );
				this.doSuccessCallback( model );
			}
		},

		handleLoadError: function( jqXHR ){
			var errorObj = { errorType: this.constructor.CONFIGURATION_ERROR };
			this.doErrorCallback( errorObj );
		},

		doSuccessCallback: function( model ){
			this.successCallback.call( this.callbackScope, model );
		},

		doErrorCallback: function( errorObj ){
			this.errorCallback.call( this.callbackScope, errorObj );
		},

		//CLIENT_URL_UNAVAILABLE error will be triggered in 2 scenarios:
		//1. Requested config file doesn't exist (meaning country isn't supported)
		//2. Config file exists but specified marketSegment isn't supported for that country.
		//
		//Note that CLIENT_URL_UNAVAILABLE is a Checkout-only error. 
		//Other apps will simply trigger a CONFIGURATION_ERROR for all error scenarios.
		isClientUrlAvailable: function( responseData ){
			return( this.isMarketSegmentSupported( responseData ) && !this.is404Response( responseData ) );
		},

		isMarketSegmentSupported: function( responseData ){
			var isAvailable = true;
			if( $.isValue( responseData.supportedMarketSegments ) ){
				isAvailable = responseData.supportedMarketSegments.indexOf( this.attr( 'marketSegment' ) ) > -1;
			}
			return isAvailable;
		},

		//There are Apache rewrite rules in place on the server
		//to return a 404.json file (with simple { "errorCode": 404 } content)
		//when a file is requested that doesn't exist (rather than returning an actual 404 response).
		//This function checks to see if the response is that 404.json file
		//
		//(Note the 404.json file has a checkoutConfig callback function. Any other components that receive
		//this 404.json response will simply fall into the error handler, not the success handler. 
		//This can be refactored if we want a 404.json response for each component)
		is404Response: function( responseData ){
			var is404 = false;
			if( $.isValue( responseData.errorCode )){
				is404 = ( responseData.errorCode === 404 );
			}
			return is404;
		},

		updateData : function( data ){
			//If the configuration data indicates that a redirect to an external experience is required, 
			//appPath won't be defined in config data (and generating the appUrl is unnecessary)
			if( data.appPath ){
				var params = this.attr(),
					origin = ( window.location.origin ) ? window.location.origin : ( window.location.protocol + "//" + window.location.hostname + ( window.location.port ? ':' + window.location.port: '' ) ),
					baseURL = ( params.isLocal ) ? origin : data.baseUrl[ this.attr('landscape') ],
					appPath =  ( params.isLocal )  ? data[ 'appPath' ].replace("/anyware/latest/", "/app/") :  data[ 'appPath' ];

				if( params.debug ) {
					appPath +=  appPath.indexOf( '?' ) > 0 ? '&compress=false' : '?compress=false';
				}

				data.appUrl = baseURL + appPath;
			}
			return this.attr( data );
		},

		getRequestUrl : function(){

			var params = this.attr(),
				baseURL = this.getBaseUrl(),
				rootPath = ( params.isLocal ) ? "/app" : "/anyware/latest",
				basePath = rootPath + '/resources/config/';

			return ( baseURL + basePath + params.appId + '/' + params.clientId + '/' + params.countryCode.toUpperCase() + '/config.json' );
		},

		getBaseUrl : function(){
			var params = this.attr(),
				protocol = document.location.protocol,
				baseUrl = '';

			if( $.isValue( params.landscape ) && !params.isLocal ){
				baseUrl = protocol + "//" + this.getConfigDomain( params.landscape );
			}

			return baseUrl;
		},

		getConfigDomain : function( landscape ){
			var domains = this.constructor.domains;

			return domains[ landscape ] || domains.prod;
		},

		getCallbackName : function( params ){
			return params.appId + 'Config';
		},

		getConfigBaseUrl : function( landscape ){
			var baseUrl = this.attr().baseUrl[ landscape ];
			return baseUrl;
		}
	});

	return configModel;

});
define('scripts/components/common/util/options-validator-util',[ 'jquery', 'can', 'scripts/components/common/util/lang' ], function( $, can ){

	var OptionsValidator = can.Construct.extend({

		/**
		 * For every validationRule in the validationRules object, will find the 
		 * corresponding value in the options object, and validate it 
		 * against the validationRule's RegExp pattern.
		 * If validation fails (or if the option has no value), will
		 * see if the validationRule specifies a defaultValue,
		 * and will populate the option with the value if it exists.
		 */
		validateOptions: function( options, configData ){
			
			if( configData.validationRules ){

				var validationRules = configData.validationRules,
					validationRule,
					optionName;
				
				for( optionName in validationRules ){
					validationRule = validationRules[ optionName ];
					options[ optionName ] = this.processValidationRule( validationRule, optionName, options );
				}
			}

			return options;
		},

		processValidationRule: function( validationRule, optionName, options ){
			var optionValue = options[ optionName ],
				validatorPattern = new RegExp( validationRule.pattern, validationRule.flags ),
				validatedValue = optionValue;

			if( !validatorPattern.test( optionValue )){
				validatedValue = this.getDefaultValue( validationRule, options );
			}

			return validatedValue;			
		},

		getDefaultValue: function( validationRule, options ){
			var defaultValue;
			if( validationRule.defaultValue ){
				defaultValue = this.getDepthValue( 0, validationRule.defaultValue, validationRule, options );	
			}
			return defaultValue;
			
		},

		getDepthValue: function( currentDepth, currentDepthValue, validationRule, options ){
			var targetDepth = validationRule.defaultValueDepth || 0,
				optionName, 
				nextDepthValue;

			if( targetDepth === currentDepth ){
				return currentDepthValue;
			} else {
				optionName = this.getOptionName( currentDepthValue );
				nextDepthValue = this.getNextDepthValue( currentDepthValue[ optionName ], optionName, options );
				return this.getDepthValue( ++currentDepth, nextDepthValue, validationRule, options );
			}
		},

		//Assumes that depthValue is an object with a single key that is an optionName.
		getOptionName: function( depthValue ){
			var optionName;
			for ( var key in depthValue ){
				optionName = key;
			}
			return optionName;
		},

		getNextDepthValue: function( depthValue, optionName, options ){
			var optionValue = options[ optionName ];
			return depthValue[ optionValue ] || depthValue.fallbackValue;
		}

	}, {} );

	return OptionsValidator;

});
        /* Simple JavaScript Inheritance
         * By John Resig http://ejohn.org/
         * MIT Licensed.
         */
        // Inspired by base2 and Prototype
        (function(){
          var initializing = false, fnTest = /xyz/.test(function(){xyz;}) ? /\b_super\b/ : /.*/;

          // The base Class implementation (does nothing)
          this.Class = function(){};

          // Create a new Class that inherits from this class
          Class.extend = function(prop) {
            var _super = this.prototype;

            // Instantiate a base class (but only create the instance,
            // don't run the init constructor)
            initializing = true;
            var prototype = new this();
            initializing = false;

            // Copy the properties over onto the new prototype
            for (var name in prop) {
              // Check if we're overwriting an existing function
              prototype[name] = typeof prop[name] == "function" &&
                typeof _super[name] == "function" && fnTest.test(prop[name]) ?
                (function(name, fn){
                  return function() {
                    var tmp = this._super;

                    // Add a new ._super() method that is the same method
                    // but on the super-class
                    this._super = _super[name];

                    // The method only need to be bound temporarily, so we
                    // remove it when we're done executing
                    var ret = fn.apply(this, arguments);
                    this._super = tmp;

                    return ret;
                  };
                })(name, prop[name]) :
                prop[name];
            }

            // The dummy class constructor
            function Class() {
              // All construction is actually done in the init method
              if ( !initializing && this.init )
                this.init.apply(this, arguments);
            }

            // Populate our constructed prototype object
            Class.prototype = prototype;

            // Enforce the constructor to be what we expect
            Class.constructor = Class;

            // And make this class extendable
            Class.extend = arguments.callee;

            return Class;
          };
        })();

define("lib/jquery-encoder/libs/Class.create", function(){});

/*
 * Copyright (c) 2010 - The OWASP Foundation
 *
 * The jquery-encoder is published by OWASP under the MIT license. You should read and accept the
 * LICENSE before you use, modify, and/or redistribute this software.
 */

(function($){var default_immune={'attr':[',','.','-','_'],'css':['(',',','\'','"',')',' '],'js':[',','.','_',' ']};var unsafeKeys={'attr':[],'css':['behavior','-moz-behavior','-ms-behavior']};$.encoder={encodeForHTML:function(input){var div=document.createElement('div');$(div).text(input);return $(div).html();},encodeForHTMLAttribute:function(input,immune){if(!immune)immune=default_immune['attr'];var encoded='';for(var i=0;i<input.length;i++){var ch=input.charAt(i),cc=input.charCodeAt(i);if(!ch.match(/[a-zA-Z0-9]/)&&$.inArray(ch,immune)<0){var hex=cc.toString(16);encoded+='&#x'+hex+';';}else{encoded+=ch;}}
return encoded;},encodeForCSS:function(input,immune){if(!immune)immune=default_immune['css'];var encoded='';for(var i=0;i<input.length;i++){var ch=input.charAt(i),cc=input.charCodeAt(i);if(!ch.match(/[a-zA-Z0-9]/)&&$.inArray(ch,immune)<0){var hex=cc.toString(16);encoded+='\\'+hex+' ';}else{encoded+=ch;}}
return encoded;},encodeForURL:function(input){return encodeURIComponent(input);},encodeForJavascript:function(input,immune){if(!immune)immune=default_immune['js'];var encoded='';for(var i=0;i<input.length;i++){var ch=input.charAt(i),cc=input.charCodeAt(i);if($.inArray(ch,immune)>=0||hex[cc]==null){encoded+=ch;continue;}
var temp=cc.toString(16),pad;if(cc<256){pad='00'.substr(temp.length);encoded+='\\x'+pad+temp.toUpperCase();}else{pad='0000'.substr(temp.length);encoded+='\\u'+pad+temp.toUpperCase();}}
return encoded;},canonicalize:function(input,strict){if(input===null)return null;var out=input,cycle_out=input;var decodeCount=0,cycles=0;var codecs=[new HTMLEntityCodec(),new PercentCodec(),new CSSCodec()];while(true){cycle_out=out;for(var i=0;i<codecs.length;i++){var new_out=codecs[i].decode(out);if(new_out!=out){decodeCount++;out=new_out;}}
if(cycle_out==out){break;}
cycles++;}
if(strict&&decodeCount>1){throw"Attack Detected - Multiple/Double Encodings used in input";}
return out;}};var hex=[];for(var c=0;c<0xFF;c++){if(c>=0x30&&c<=0x39||c>=0x41&&c<=0x5a||c>=0x61&&c<=0x7a){hex[c]=null;}else{hex[c]=c.toString(16);}}
var methods={html:function(opts){return $.encoder.encodeForHTML(opts.unsafe);},css:function(opts){var work=[];var out=[];if(opts.map){work=opts.map;}else{work[opts.name]=opts.unsafe;}
for(var k in work){if(!(typeof work[k]=='function')&&work.hasOwnProperty(k)){var cKey=$.encoder.canonicalize(k,opts.strict);if($.inArray(cKey,unsafeKeys[opts.context])<0){out[k]=$.encoder.encodeForCSS(work[k]);}}}
return out;},attr:function(opts){var work=[];var out=[];if(opts.map){work=opts.map;}else{work[opts.name]=opts.unsafe;}
for(var k in work){if(!(typeof work[k]=='function')&&work.hasOwnProperty(k)){var cKey=$.encoder.canonicalize(k,opts.strict);if($.inArray(cKey,unsafeKeys[opts.context])<0){out[k]=$.encoder.encodeForHTMLAttribute(work[k]);}}}
return out;}};$.fn.encode=function(){var argCount=arguments.length;var opts={'context':'html','unsafe':null,'name':null,'map':null,'setter':null,'strict':true};if(argCount==1&&typeof arguments[0]=='object'){$.extend(opts,arguments[0]);}else{opts.context=arguments[0];if(arguments.length==2){if(opts.context=='html'){opts.unsafe=arguments[1];}
else if(opts.content=='attr'||opts.content=='css'){opts.map=arguments[1];}}else{opts.name=arguments[1];opts.unsafe=arguments[2];}}
if(opts.context=='html'){opts.setter=this.html;}
else if(opts.context=='css'){opts.setter=this.css;}
else if(opts.context=='attr'){opts.setter=this.attr;}
return opts.setter.call(this,methods[opts.context].call(this,opts));};var PushbackString=Class.extend({_input:null,_pushback:null,_temp:null,_index:0,_mark:0,_hasNext:function(){if(this._input==null)return false;if(this._input.length==0)return false;return this._index<this._input.length;},init:function(input){this._input=input;},pushback:function(c){this._pushback=c;},index:function(){return this._index;},hasNext:function(){if(this._pushback!=null)return true;return this._hasNext();},next:function(){if(this._pushback!=null){var save=this._pushback;this._pushback=null;return save;}
return(this._hasNext())?this._input.charAt(this._index++):null;},nextHex:function(){var c=this.next();if(c==null)return null;if(c.match(/[0-9A-Fa-f]/))return c;return null;},peek:function(c){if(c){if(this._pushback&&this._pushback==c)return true;return this._hasNext()?this._input.charAt(this._index)==c:false;}
if(this._pushback)return this._pushback;return this._hasNext()?this._input.charAt(this._index):null;},mark:function(){this._temp=this._pushback;this._mark=this._index;},reset:function(){this._pushback=this._temp;this._index=this._mark;},remainder:function(){var out=this._input.substr(this._index);if(this._pushback!=null){out=this._pushback+out;}
return out;}});var Codec=Class.extend({decode:function(input){var out='',pbs=new PushbackString(input);while(pbs.hasNext()){var c=this.decodeCharacter(pbs);if(c!=null){out+=c;}else{out+=pbs.next();}}
return out;},decodeCharacter:function(pbs){return pbs.next();}});var HTMLEntityCodec=Codec.extend({decodeCharacter:function(input){input.mark();var first=input.next();if(first==null||first!='&'){input.reset();return null;}
var second=input.next();if(second==null){input.reset();return null;}
var c;if(second=='#'){c=this._getNumericEntity(input);if(c!=null)return c;}else if(second.match(/[A-Za-z]/)){input.pushback(second);c=this._getNamedEntity(input);if(c!=null)return c;}
input.reset();return null;},_getNamedEntity:function(input){var possible='',entry,len;len=Math.min(input.remainder().length,ENTITY_TO_CHAR_TRIE.getMaxKeyLength());for(var i=0;i<len;i++){possible+=input.next().toLowerCase();}
entry=ENTITY_TO_CHAR_TRIE.getLongestMatch(possible);if(entry==null)
return null;input.reset();input.next();len=entry.getKey().length;for(var j=0;j<len;j++){input.next();}
if(input.peek(';'))
input.next();return entry.getValue();},_getNumericEntity:function(input){var first=input.peek();if(first==null)return null;if(first=='x'||first=='X'){input.next();return this._parseHex(input);}
return this._parseNumber(input);},_parseHex:function(input){var out='';while(input.hasNext()){var c=input.peek();if(!isNaN(parseInt(c,16))){out+=c;input.next();}else if(c==';'){input.next();break;}else{break;}}
var i=parseInt(out,16);if(!isNaN(i)&&isValidCodePoint(i))return String.fromCharCode(i);return null;},_parseNumber:function(input){var out='';while(input.hasNext()){var ch=input.peek();if(!isNaN(parseInt(ch,10))){out+=ch;input.next();}else if(ch==';'){input.next();break;}else{break;}}
var i=parseInt(out,10);if(!isNaN(i)&&isValidCodePoint(i))return String.fromCharCode(i);return null;}});var PercentCodec=Codec.extend({decodeCharacter:function(input){input.mark();var first=input.next();if(first==null){input.reset();return null;}
if(first!='%'){input.reset();return null;}
var out='';for(var i=0;i<2;i++){var c=input.nextHex();if(c!=null)out+=c;}
if(out.length==2){var p=parseInt(out,16);if(isValidCodePoint(p))
return String.fromCharCode(p);}
input.reset();return null;}});var CSSCodec=Codec.extend({decodeCharacter:function(input){input.mark();var first=input.next();if(first==null||first!='\\'){input.reset();return null;}
var second=input.next();if(second==null){input.reset();return null;}
switch(second){case'\r':if(input.peek('\n')){input.next();}
case'\n':case'\f':case'\u0000':return this.decodeCharacter(input);}
if(parseInt(second,16)=='NaN'){return second;}
var out=second;for(var j=0;j<5;j++){var c=input.next();if(c==null||isWhiteSpace(c)){break;}
if(parseInt(c,16)!='NaN'){out+=c;}else{input.pushback(c);break;}}
var p=parseInt(out,16);if(isValidCodePoint(p))
return String.fromCharCode(p);return'\ufffd';}});var Trie=Class.extend({root:null,maxKeyLen:0,size:0,init:function(){this.clear();},getLongestMatch:function(key){return(this.root==null&&key==null)?null:this.root.getLongestMatch(key,0);},getMaxKeyLength:function(){return this.maxKeyLen;},clear:function(){this.root=null,this.maxKeyLen=0,this.size=0;},put:function(key,val){var len,old;if(this.root==null)
this.root=new Trie.Node();if((old=this.root.put(key,0,val))!=null)
return old;if((len=key.length)>this.maxKeyLen)
this.maxKeyLen=key.length;this.size++;return null;}});Trie.Entry=Class.extend({_key:null,_value:null,init:function(key,value){this._key=key,this._value=value;},getKey:function(){return this._key;},getValue:function(){return this._value;},equals:function(other){if(!(other instanceof Trie.Entry)){return false;}
return this._key==other._key&&this._value==other._value;}});Trie.Node=Class.extend({_value:null,_nextMap:null,setValue:function(value){this._value=value;},getNextNode:function(ch){if(!this._nextMap)return null;return this._nextMap[ch];},put:function(key,pos,value){var nextNode,ch,old;if(key.length==pos){old=this._value;this.setValue(value);return old;}
ch=key.charAt(pos);if(this._nextMap==null){this._nextMap=Trie.Node.newNodeMap();nextNode=new Trie.Node();this._nextMap[ch]=nextNode;}else if((nextNode=this._nextMap[ch])==null){nextNode=new Trie.Node();this._nextMap[ch]=nextNode;}
return nextNode.put(key,pos+1,value);},get:function(key,pos){var nextNode;if(key.length<=pos)
return this._value;if((nextNode=this.getNextNode(key.charAt(pos)))==null)
return null;return nextNode.get(key,pos+1);},getLongestMatch:function(key,pos){var nextNode,ret;if(key.length<=pos){return Trie.Entry.newInstanceIfNeeded(key,this._value);}
if((nextNode=this.getNextNode(key.charAt(pos)))==null){return Trie.Entry.newInstanceIfNeeded(key,pos,this._value);}
if((ret=nextNode.getLongestMatch(key,pos+1))!=null){return ret;}
return Trie.Entry.newInstanceIfNeeded(key,pos,this._value);}});Trie.Entry.newInstanceIfNeeded=function(){var key=arguments[0],value,keyLength;if(typeof arguments[1]=='string'){value=arguments[1];keyLength=key.length;}else{keyLength=arguments[1];value=arguments[2];}
if(value==null||key==null){return null;}
if(key.length>keyLength){key=key.substr(0,keyLength);}
return new Trie.Entry(key,value);};Trie.Node.newNodeMap=function(){return{};};var isValidCodePoint=function(codepoint){return codepoint>=0x0000&&codepoint<=0x10FFFF;};var isWhiteSpace=function(input){return input.match(/[\s]/);};var MAP_ENTITY_TO_CHAR=[];var MAP_CHAR_TO_ENTITY=[];var ENTITY_TO_CHAR_TRIE=new Trie();(function(){MAP_ENTITY_TO_CHAR["&quot"]="34";MAP_ENTITY_TO_CHAR["&amp"]="38";MAP_ENTITY_TO_CHAR["&lt"]="60";MAP_ENTITY_TO_CHAR["&gt"]="62";MAP_ENTITY_TO_CHAR["&nbsp"]="160";MAP_ENTITY_TO_CHAR["&iexcl"]="161";MAP_ENTITY_TO_CHAR["&cent"]="162";MAP_ENTITY_TO_CHAR["&pound"]="163";MAP_ENTITY_TO_CHAR["&curren"]="164";MAP_ENTITY_TO_CHAR["&yen"]="165";MAP_ENTITY_TO_CHAR["&brvbar"]="166";MAP_ENTITY_TO_CHAR["&sect"]="167";MAP_ENTITY_TO_CHAR["&uml"]="168";MAP_ENTITY_TO_CHAR["&copy"]="169";MAP_ENTITY_TO_CHAR["&ordf"]="170";MAP_ENTITY_TO_CHAR["&laquo"]="171";MAP_ENTITY_TO_CHAR["&not"]="172";MAP_ENTITY_TO_CHAR["&shy"]="173";MAP_ENTITY_TO_CHAR["&reg"]="174";MAP_ENTITY_TO_CHAR["&macr"]="175";MAP_ENTITY_TO_CHAR["&deg"]="176";MAP_ENTITY_TO_CHAR["&plusmn"]="177";MAP_ENTITY_TO_CHAR["&sup2"]="178";MAP_ENTITY_TO_CHAR["&sup3"]="179";MAP_ENTITY_TO_CHAR["&acute"]="180";MAP_ENTITY_TO_CHAR["&micro"]="181";MAP_ENTITY_TO_CHAR["&para"]="182";MAP_ENTITY_TO_CHAR["&middot"]="183";MAP_ENTITY_TO_CHAR["&cedil"]="184";MAP_ENTITY_TO_CHAR["&sup1"]="185";MAP_ENTITY_TO_CHAR["&ordm"]="186";MAP_ENTITY_TO_CHAR["&raquo"]="187";MAP_ENTITY_TO_CHAR["&frac14"]="188";MAP_ENTITY_TO_CHAR["&frac12"]="189";MAP_ENTITY_TO_CHAR["&frac34"]="190";MAP_ENTITY_TO_CHAR["&iquest"]="191";MAP_ENTITY_TO_CHAR["&Agrave"]="192";MAP_ENTITY_TO_CHAR["&Aacute"]="193";MAP_ENTITY_TO_CHAR["&Acirc"]="194";MAP_ENTITY_TO_CHAR["&Atilde"]="195";MAP_ENTITY_TO_CHAR["&Auml"]="196";MAP_ENTITY_TO_CHAR["&Aring"]="197";MAP_ENTITY_TO_CHAR["&AElig"]="198";MAP_ENTITY_TO_CHAR["&Ccedil"]="199";MAP_ENTITY_TO_CHAR["&Egrave"]="200";MAP_ENTITY_TO_CHAR["&Eacute"]="201";MAP_ENTITY_TO_CHAR["&Ecirc"]="202";MAP_ENTITY_TO_CHAR["&Euml"]="203";MAP_ENTITY_TO_CHAR["&Igrave"]="204";MAP_ENTITY_TO_CHAR["&Iacute"]="205";MAP_ENTITY_TO_CHAR["&Icirc"]="206";MAP_ENTITY_TO_CHAR["&Iuml"]="207";MAP_ENTITY_TO_CHAR["&ETH"]="208";MAP_ENTITY_TO_CHAR["&Ntilde"]="209";MAP_ENTITY_TO_CHAR["&Ograve"]="210";MAP_ENTITY_TO_CHAR["&Oacute"]="211";MAP_ENTITY_TO_CHAR["&Ocirc"]="212";MAP_ENTITY_TO_CHAR["&Otilde"]="213";MAP_ENTITY_TO_CHAR["&Ouml"]="214";MAP_ENTITY_TO_CHAR["&times"]="215";MAP_ENTITY_TO_CHAR["&Oslash"]="216";MAP_ENTITY_TO_CHAR["&Ugrave"]="217";MAP_ENTITY_TO_CHAR["&Uacute"]="218";MAP_ENTITY_TO_CHAR["&Ucirc"]="219";MAP_ENTITY_TO_CHAR["&Uuml"]="220";MAP_ENTITY_TO_CHAR["&Yacute"]="221";MAP_ENTITY_TO_CHAR["&THORN"]="222";MAP_ENTITY_TO_CHAR["&szlig"]="223";MAP_ENTITY_TO_CHAR["&agrave"]="224";MAP_ENTITY_TO_CHAR["&aacute"]="225";MAP_ENTITY_TO_CHAR["&acirc"]="226";MAP_ENTITY_TO_CHAR["&atilde"]="227";MAP_ENTITY_TO_CHAR["&auml"]="228";MAP_ENTITY_TO_CHAR["&aring"]="229";MAP_ENTITY_TO_CHAR["&aelig"]="230";MAP_ENTITY_TO_CHAR["&ccedil"]="231";MAP_ENTITY_TO_CHAR["&egrave"]="232";MAP_ENTITY_TO_CHAR["&eacute"]="233";MAP_ENTITY_TO_CHAR["&ecirc"]="234";MAP_ENTITY_TO_CHAR["&euml"]="235";MAP_ENTITY_TO_CHAR["&igrave"]="236";MAP_ENTITY_TO_CHAR["&iacute"]="237";MAP_ENTITY_TO_CHAR["&icirc"]="238";MAP_ENTITY_TO_CHAR["&iuml"]="239";MAP_ENTITY_TO_CHAR["&eth"]="240";MAP_ENTITY_TO_CHAR["&ntilde"]="241";MAP_ENTITY_TO_CHAR["&ograve"]="242";MAP_ENTITY_TO_CHAR["&oacute"]="243";MAP_ENTITY_TO_CHAR["&ocirc"]="244";MAP_ENTITY_TO_CHAR["&otilde"]="245";MAP_ENTITY_TO_CHAR["&ouml"]="246";MAP_ENTITY_TO_CHAR["&divide"]="247";MAP_ENTITY_TO_CHAR["&oslash"]="248";MAP_ENTITY_TO_CHAR["&ugrave"]="249";MAP_ENTITY_TO_CHAR["&uacute"]="250";MAP_ENTITY_TO_CHAR["&ucirc"]="251";MAP_ENTITY_TO_CHAR["&uuml"]="252";MAP_ENTITY_TO_CHAR["&yacute"]="253";MAP_ENTITY_TO_CHAR["&thorn"]="254";MAP_ENTITY_TO_CHAR["&yuml"]="255";MAP_ENTITY_TO_CHAR["&OElig"]="338";MAP_ENTITY_TO_CHAR["&oelig"]="339";MAP_ENTITY_TO_CHAR["&Scaron"]="352";MAP_ENTITY_TO_CHAR["&scaron"]="353";MAP_ENTITY_TO_CHAR["&Yuml"]="376";MAP_ENTITY_TO_CHAR["&fnof"]="402";MAP_ENTITY_TO_CHAR["&circ"]="710";MAP_ENTITY_TO_CHAR["&tilde"]="732";MAP_ENTITY_TO_CHAR["&Alpha"]="913";MAP_ENTITY_TO_CHAR["&Beta"]="914";MAP_ENTITY_TO_CHAR["&Gamma"]="915";MAP_ENTITY_TO_CHAR["&Delta"]="916";MAP_ENTITY_TO_CHAR["&Epsilon"]="917";MAP_ENTITY_TO_CHAR["&Zeta"]="918";MAP_ENTITY_TO_CHAR["&Eta"]="919";MAP_ENTITY_TO_CHAR["&Theta"]="920";MAP_ENTITY_TO_CHAR["&Iota"]="921";MAP_ENTITY_TO_CHAR["&Kappa"]="922";MAP_ENTITY_TO_CHAR["&Lambda"]="923";MAP_ENTITY_TO_CHAR["&Mu"]="924";MAP_ENTITY_TO_CHAR["&Nu"]="925";MAP_ENTITY_TO_CHAR["&Xi"]="926";MAP_ENTITY_TO_CHAR["&Omicron"]="927";MAP_ENTITY_TO_CHAR["&Pi"]="928";MAP_ENTITY_TO_CHAR["&Rho"]="929";MAP_ENTITY_TO_CHAR["&Sigma"]="931";MAP_ENTITY_TO_CHAR["&Tau"]="932";MAP_ENTITY_TO_CHAR["&Upsilon"]="933";MAP_ENTITY_TO_CHAR["&Phi"]="934";MAP_ENTITY_TO_CHAR["&Chi"]="935";MAP_ENTITY_TO_CHAR["&Psi"]="936";MAP_ENTITY_TO_CHAR["&Omega"]="937";MAP_ENTITY_TO_CHAR["&alpha"]="945";MAP_ENTITY_TO_CHAR["&beta"]="946";MAP_ENTITY_TO_CHAR["&gamma"]="947";MAP_ENTITY_TO_CHAR["&delta"]="948";MAP_ENTITY_TO_CHAR["&epsilon"]="949";MAP_ENTITY_TO_CHAR["&zeta"]="950";MAP_ENTITY_TO_CHAR["&eta"]="951";MAP_ENTITY_TO_CHAR["&theta"]="952";MAP_ENTITY_TO_CHAR["&iota"]="953";MAP_ENTITY_TO_CHAR["&kappa"]="954";MAP_ENTITY_TO_CHAR["&lambda"]="955";MAP_ENTITY_TO_CHAR["&mu"]="956";MAP_ENTITY_TO_CHAR["&nu"]="957";MAP_ENTITY_TO_CHAR["&xi"]="958";MAP_ENTITY_TO_CHAR["&omicron"]="959";MAP_ENTITY_TO_CHAR["&pi"]="960";MAP_ENTITY_TO_CHAR["&rho"]="961";MAP_ENTITY_TO_CHAR["&sigmaf"]="962";MAP_ENTITY_TO_CHAR["&sigma"]="963";MAP_ENTITY_TO_CHAR["&tau"]="964";MAP_ENTITY_TO_CHAR["&upsilon"]="965";MAP_ENTITY_TO_CHAR["&phi"]="966";MAP_ENTITY_TO_CHAR["&chi"]="967";MAP_ENTITY_TO_CHAR["&psi"]="968";MAP_ENTITY_TO_CHAR["&omega"]="969";MAP_ENTITY_TO_CHAR["&thetasym"]="977";MAP_ENTITY_TO_CHAR["&upsih"]="978";MAP_ENTITY_TO_CHAR["&piv"]="982";MAP_ENTITY_TO_CHAR["&ensp"]="8194";MAP_ENTITY_TO_CHAR["&emsp"]="8195";MAP_ENTITY_TO_CHAR["&thinsp"]="8201";MAP_ENTITY_TO_CHAR["&zwnj"]="8204";MAP_ENTITY_TO_CHAR["&zwj"]="8205";MAP_ENTITY_TO_CHAR["&lrm"]="8206";MAP_ENTITY_TO_CHAR["&rlm"]="8207";MAP_ENTITY_TO_CHAR["&ndash"]="8211";MAP_ENTITY_TO_CHAR["&mdash"]="8212";MAP_ENTITY_TO_CHAR["&lsquo"]="8216";MAP_ENTITY_TO_CHAR["&rsquo"]="8217";MAP_ENTITY_TO_CHAR["&sbquo"]="8218";MAP_ENTITY_TO_CHAR["&ldquo"]="8220";MAP_ENTITY_TO_CHAR["&rdquo"]="8221";MAP_ENTITY_TO_CHAR["&bdquo"]="8222";MAP_ENTITY_TO_CHAR["&dagger"]="8224";MAP_ENTITY_TO_CHAR["&Dagger"]="8225";MAP_ENTITY_TO_CHAR["&bull"]="8226";MAP_ENTITY_TO_CHAR["&hellip"]="8230";MAP_ENTITY_TO_CHAR["&permil"]="8240";MAP_ENTITY_TO_CHAR["&prime"]="8242";MAP_ENTITY_TO_CHAR["&Prime"]="8243";MAP_ENTITY_TO_CHAR["&lsaquo"]="8249";MAP_ENTITY_TO_CHAR["&rsaquo"]="8250";MAP_ENTITY_TO_CHAR["&oline"]="8254";MAP_ENTITY_TO_CHAR["&frasl"]="8260";MAP_ENTITY_TO_CHAR["&euro"]="8364";MAP_ENTITY_TO_CHAR["&image"]="8365";MAP_ENTITY_TO_CHAR["&weierp"]="8472";MAP_ENTITY_TO_CHAR["&real"]="8476";MAP_ENTITY_TO_CHAR["&trade"]="8482";MAP_ENTITY_TO_CHAR["&alefsym"]="8501";MAP_ENTITY_TO_CHAR["&larr"]="8592";MAP_ENTITY_TO_CHAR["&uarr"]="8593";MAP_ENTITY_TO_CHAR["&rarr"]="8594";MAP_ENTITY_TO_CHAR["&darr"]="8595";MAP_ENTITY_TO_CHAR["&harr"]="8596";MAP_ENTITY_TO_CHAR["&crarr"]="8629";MAP_ENTITY_TO_CHAR["&lArr"]="8656";MAP_ENTITY_TO_CHAR["&uArr"]="8657";MAP_ENTITY_TO_CHAR["&rArr"]="8658";MAP_ENTITY_TO_CHAR["&dArr"]="8659";MAP_ENTITY_TO_CHAR["&hArr"]="8660";MAP_ENTITY_TO_CHAR["&forall"]="8704";MAP_ENTITY_TO_CHAR["&part"]="8706";MAP_ENTITY_TO_CHAR["&exist"]="8707";MAP_ENTITY_TO_CHAR["&empty"]="8709";MAP_ENTITY_TO_CHAR["&nabla"]="8711";MAP_ENTITY_TO_CHAR["&isin"]="8712";MAP_ENTITY_TO_CHAR["&notin"]="8713";MAP_ENTITY_TO_CHAR["&ni"]="8715";MAP_ENTITY_TO_CHAR["&prod"]="8719";MAP_ENTITY_TO_CHAR["&sum"]="8721";MAP_ENTITY_TO_CHAR["&minus"]="8722";MAP_ENTITY_TO_CHAR["&lowast"]="8727";MAP_ENTITY_TO_CHAR["&radic"]="8730";MAP_ENTITY_TO_CHAR["&prop"]="8733";MAP_ENTITY_TO_CHAR["&infin"]="8734";MAP_ENTITY_TO_CHAR["&ang"]="8736";MAP_ENTITY_TO_CHAR["&and"]="8743";MAP_ENTITY_TO_CHAR["&or"]="8744";MAP_ENTITY_TO_CHAR["&cap"]="8745";MAP_ENTITY_TO_CHAR["&cup"]="8746";MAP_ENTITY_TO_CHAR["&int"]="8747";MAP_ENTITY_TO_CHAR["&there4"]="8756";MAP_ENTITY_TO_CHAR["&sim"]="8764";MAP_ENTITY_TO_CHAR["&cong"]="8773";MAP_ENTITY_TO_CHAR["&asymp"]="8776";MAP_ENTITY_TO_CHAR["&ne"]="8800";MAP_ENTITY_TO_CHAR["&equiv"]="8801";MAP_ENTITY_TO_CHAR["&le"]="8804";MAP_ENTITY_TO_CHAR["&ge"]="8805";MAP_ENTITY_TO_CHAR["&sub"]="8834";MAP_ENTITY_TO_CHAR["&sup"]="8835";MAP_ENTITY_TO_CHAR["&nsub"]="8836";MAP_ENTITY_TO_CHAR["&sube"]="8838";MAP_ENTITY_TO_CHAR["&supe"]="8839";MAP_ENTITY_TO_CHAR["&oplus"]="8853";MAP_ENTITY_TO_CHAR["&otimes"]="8855";MAP_ENTITY_TO_CHAR["&perp"]="8869";MAP_ENTITY_TO_CHAR["&sdot"]="8901";MAP_ENTITY_TO_CHAR["&lceil"]="8968";MAP_ENTITY_TO_CHAR["&rceil"]="8969";MAP_ENTITY_TO_CHAR["&lfloor"]="8970";MAP_ENTITY_TO_CHAR["&rfloor"]="8971";MAP_ENTITY_TO_CHAR["&lang"]="9001";MAP_ENTITY_TO_CHAR["&rang"]="9002";MAP_ENTITY_TO_CHAR["&loz"]="9674";MAP_ENTITY_TO_CHAR["&spades"]="9824";MAP_ENTITY_TO_CHAR["&clubs"]="9827";MAP_ENTITY_TO_CHAR["&hearts"]="9829";MAP_ENTITY_TO_CHAR["&diams"]="9830";for(var entity in MAP_ENTITY_TO_CHAR){if(!(typeof MAP_ENTITY_TO_CHAR[entity]=='function')&&MAP_ENTITY_TO_CHAR.hasOwnProperty(entity)){MAP_CHAR_TO_ENTITY[MAP_ENTITY_TO_CHAR[entity]]=entity;}}
for(var c in MAP_CHAR_TO_ENTITY){if(!(typeof MAP_CHAR_TO_ENTITY[c]=='function')&&MAP_CHAR_TO_ENTITY.hasOwnProperty(c)){var ent=MAP_CHAR_TO_ENTITY[c].toLowerCase().substr(1);ENTITY_TO_CHAR_TRIE.put(ent,String.fromCharCode(c));}}})();if(Object.freeze){$.encoder=Object.freeze($.encoder);$.fn.encode=Object.freeze($.fn.encode);}else if(Object.seal){$.encoder=Object.seal($.encoder);$.fn.encode=Object.seal($.fn.encode);}else if(Object.preventExtensions){$.encoder=Object.preventExtensions($.encoder);$.fn.encode=Object.preventExtensions($.fn.encode);}})(jQuery);
define("lib/jquery-encoder/jquery-encoder-0.1.0", ["lib/jquery-encoder/libs/Class.create"], function(){});

define('scripts/components/common/util/jquery-encoder',[ 'can', 'jquery', 'lib/jquery-encoder/jquery-encoder-0.1.0', 'scripts/components/common/util/lang' ], function( can, $ ){

	// This utility wraps the functionality of the jquery-encoder plugin so that 
	// encoding can be performed on Array and Object values (not just simple primitive 
	// values like the plugin functions are expecting).
	//
	// Right now the only plugin encoding function being called is encodeForHTML,
	// which (despite the name) does what we want it to do for passing these
	// values through the openajax hub and into the Checkout application, for example.
	// If we want to expose additional plugin functions, this can be refactored to allow that.
	var Encoder = can.Construct.extend({
		encode: function( value ){
			if( $.isArray( value )){
				return this.encodeArray( value );
			} else if( $.isPlainObject( value )){
				return this.encodeObject( value );
			}
			return this.encodeSimpleValue( value );
		},

		//Don't process Boolean and Number values so they don't get 
		//cast to Strings unnecessarily.
		doesNotRequireEncoding: function( value ){
			return $.isBoolean( value ) || $.isNumber( value );
		},

		encodeArray: function( arrayValue ){
			var encodedArray = [],
				self = this;

			$.each( arrayValue, function( index, value ){
				encodedArray.push( self.encode( value ));
			});
			return encodedArray;
		},

		encodeObject: function( objValue ){
			var encodedObj = {},
				self = this;

			$.each( objValue, function( key, value ){
				encodedObj[ key ] = self.encode( value );
			});
			return encodedObj;
		},

		encodeSimpleValue: function( value ){
			if( this.doesNotRequireEncoding( value )){
				return value;
			} else {
				return $.encoder.encodeForHTML( value );	
			}
		}

	}, {});

	return Encoder;
});
define( 'scripts/anyware-widgets/base-widget/base-widget',[
	'jquery',
	'can',
	'scripts/core/container/container',
	'scripts/components/common/models/configuration-model',
	'scripts/components/common/util/options-validator-util',
	'scripts/components/common/util/jquery-encoder',
	'lib/canjs/amd/can/control/plugin',
	'can-proxy'
], function( $, can, Container, ConfigurationModel, OptionsValidator, Encoder ) {

	//--------------------------------------
	// Events Dispatched (via DOM):
	// configured
	// loaded
	// ready
	// resized
	// errorEvent
	//--------------------------------------
	var BaseWidget = can.Control.extend(

		//STATIC
		{
			//Defined by subclass. Indicates name to be used when instantiating widget as a plugin.
			pluginName: '',

			//Defined by subclass. Will be used to determine path to config file.
			appId: '',

			defaults: {
				//Required
				clientId: '',
				countryCode: '',

				//Required for payment-tokenizer
				acceptedCreditCardTypes: [],

				//Optional
				languageCode: '',
				landscape: 'prod', //'prod', 'stage', 'pre-stage', 'dev'
				marketSegment: 'COM', // 'COM', 'EDU'
				autoLoad: true,
				autoRun: true,
				tunnelPath: '',
				debug: false,
				timeout: 15000,

				//These are the default required options (must be passed in by client).
				//If a subclass has additional/different required options, it needs to override.
				requiredOptions: [
					'clientId',
					'countryCode'
				]
			}
		},

		//PROTOTYPE
		{
			eventObj: {},
			//------------------------
			// Init Functions
			//------------------------
			init: function(){
				this.initStateFlags();
				this.processOptions();
				this.loadConfig();
			},

			initStateFlags: function(){
				this.isConfigLoaded = false; //isConfigured() returns this value
				this.isComponentRunning = false; //isRunning() returns this value
			},

			processOptions: function(){
				this.setAdditionalOptions();
				this.encodeOptions();
				this.checkRequiredOptions();
				this.enforceOptionFormatting();
			},

			encodeOptions: function(){
				this.options = Encoder.encode( this.options );
			},

			checkRequiredOptions: function() {
				for( var i = 0; i < this.options.requiredOptions.length; i++ ) {
					var option = this.options.requiredOptions[ i ];
					if( ( this.options[ option ] ).length < 1 ) {
						throw new Error( 'Missing Required Option: ' + option );
					}
				}
			},

			enforceOptionFormatting: function(){
				this.options.countryCode = this.options.countryCode.toUpperCase();
				this.options.languageCode = this.options.languageCode.toLowerCase();
			},

			setAdditionalOptions: function(){
				//Override as necessary
			},

			//--------------------------------------------
			//Initialization Step 1: Load Configuration
			//--------------------------------------------
			loadConfig: function() {
				var configParams = {
					landscape: this.options.landscape,
					appId: this.constructor.appId,
					clientId: this.options.clientId,
					countryCode: this.options.countryCode,
					marketSegment: this.options.marketSegment,
					isLocal : this.options.isLocal,
					debug : this.options.debug
				};

				this.configurationModel = new ConfigurationModel( configParams );
				this.configurationModel.load( this, this.proxy( 'onConfigLoaded' ), this.proxy( 'onConfigError' ) );
			},

			onConfigLoaded: function() {
				var configurationData = this.configurationModel.attr();
				this.isConfigLoaded = true;
				this.triggerEvent( 'configured', { configurationData: configurationData } );

				this.options = OptionsValidator.validateOptions( this.options, configurationData );
				
				if( this.options.autoLoad ) {
					this.load();
				}
			},

			onConfigError: function( errorObj ) {
				this.configErrorOccurred = true;
				this.triggerEvent( 'errorEvent', errorObj );
			},

			isConfigured: function(){
				return this.isConfigLoaded;
			},

			//--------------------------------------------
			//Initialization Step 2: Load App
			//--------------------------------------------
			load: function() {
				if( !this.container ) {
					this.container = this.createContainer();
					this.container.loadComponent( this.proxy( 'onComponentLoaded' ) );
					this.container.subscribe( '**', this.proxy( 'globalHandler' ) );
				}
				else {
					throw new Error( 'Load requested, but component is already loaded.' );
				}
			},

			//Deprecated (in favor of isLoaded)! Make sure nobody is using this before pulling it out
			loaded: function() {
				return this.isLoaded();
			},

			isLoaded: function() {
				var loaded = false;
				if( this.container ){
					loaded = this.container.isConnected();
				}
				return loaded;
			},

			onComponentLoaded: function() {
				this.triggerEvent( 'loaded' );
				this.subscribeToHubEvents();
				if( this.options.autoRun ) {
					this.run();
				}
			},

			createContainer: function() {
				var appId = this.constructor.appId,
					element = this.element[0],
					appUrl = this.configurationModel.attr( 'appUrl' ),
					tunnelPath = this.options.tunnelPath,
					iframeAttrs = this.options.iframeAttrs,
					timeout = this.options.timeout,
					container = new Container( appId, element, appUrl, tunnelPath, iframeAttrs, timeout );

				this.setContainerListeners();
				return container;
			},

			subscribe: function( event, callback ) {
				this.eventObj[event] = this.eventObj[event] || [];
				this.eventObj[event].push( callback ); 
			},

			globalHandler: function( ev, data ) {
				//get the method name
				var evNamespaceArray = ev.split( "." ),
					eventName = evNamespaceArray[ evNamespaceArray.length-1 ];	
				if( $.isArray(this.eventObj[eventName]) ) {
					this.triggerSubscribe( eventName, data );
				} else {
					this.triggerDefault( eventName, data );
				}	 
			},

			triggerSubscribe: function( eventName, data ) {
				var handlerArr = this.eventObj[eventName];
				for(var i= 0; i<handlerArr.length; i++) {
					if( typeof handlerArr[i] === 'function' ) {
						//canjs proxy takes care its context.
						handlerArr[i]( eventName, data );	
					} else{
						this.triggerDefault( eventName, data );	
					}  
				}
			},

			triggerDefault: function(eventName, data){
				this.triggerEvent( eventName, data );
			},

			//--------------------------------------------
			//Initialization Step 3: Run App
			//--------------------------------------------
			run: function() {
				if( !this.isComponentRunning ) {
					if( this.isLoaded() ) {
						this.initializeComponent();
					}
				}
				else {
					throw new Error( 'Run requested, but component is already running.' );
				}
			},

			isRunning: function(){
				return this.isComponentRunning;
			},

			initializeComponent: function() {
				if( this.isLoaded() ) {
					var data = this.getComponentData();
					this.container.publish( 'initialize', data );
					this.isComponentRunning = true;
				}
			},

			getComponentData: function() {
				return {
					initOptions: this.options,
					configuration: this.configurationModel.attr()
				};
			},

			//--------------------------
			//Widget Lifecycle Methods
			//--------------------------
			destroy: function() {
				if( this.isLoaded() ) {
					this.container.unloadComponent();
				}
				can.Control.prototype.destroy.call( this );
			},

			unload: function() {
				if( this.isLoaded() ){
					this.container.unloadComponent();
					this.element.empty().trigger( 'unloaded' );
				}
			},

			reload: function() {
				if( this.isLoaded() ){
					this.container.unloadComponent();
					this.container.loadComponent( this.proxy( 'componentReloaded' ) );
				}
			},

			componentReloaded: function(){
				//If the component was running before we reloaded it, 
				//we need to call run so it is running again
				if( this.isComponentRunning ){
					this.isComponentRunning = false;
					this.run();
				}
			},

			//--------------------------
			//Event Listeners
			//--------------------------
			subscribeToHubEvents : function() {
				// can be overridden if necessary in widgets
			},

			setContainerListeners: function(){
				//this.subscribe( 'applicationReady', this.proxy( 'onApplicationReady' ) );
				//this.subscribe( 'resized', this.proxy( 'onSizeChange' ) );
				this.subscribe( 'formError', this.proxy( 'onFormError' ) );
				this.subscribe( 'validationError', this.proxy( 'onValidationError' ) );
			},

			//Dispatched when xdomain connection is established.

			onFormError: function( event, data ){
				var errorType = 'FORM_ERROR';
				this.triggerEvent( 'errorEvent', { errorType: errorType,
					errors: data });
			},

			onValidationError: function( event, data ){
				var errorType = 'VALIDATION_ERROR';
				this.triggerEvent( 'errorEvent', { errorType: errorType,
					errors: data });
			},

			triggerEvent: function( event, data ){
				if( this.element ){
					this.element.trigger( event, data );
				}
			},

			//---------------------------------------------------------
			// NOTE! appUrl is dynamically generated from a 
			// combination of initOptions (landscape), and configuration
			// parameters (baseUrl + appPath).
			// Accessing/modifying this value is only intended for internal use. 
			//----------------------------------------------------------
			__getAppUrl: function(){
				return this.configurationModel.attr( 'appUrl' );
			},

			__setAppUrl: function( appUrl ){
				this.configurationModel.attr( 'appUrl', appUrl );
			}
		}
	);

	return BaseWidget;

} );
define( 'tokenizer',[
	'jquery',
	'scripts/anyware-widgets/base-widget/base-widget',
	'lib/canjs/amd/can/control/plugin',
	'can-super'
], function( $, BaseWidget ) {

	var TokenizerWidget = BaseWidget.extend(

		//Static
		{
			pluginName: 'anyware_payment_tokenizer',
			appId: 'tokenizer'
		},

		//Prototype
		{
			//Add 'acceptedCreditCardTypes to requiredOptions before doing the check
			checkRequiredOptions: function(){
				this.options.requiredOptions.push( 'acceptedCreditCardTypes' );
				this._super();
			},

			//---- Payment Tokenizer API ----------------------------
			setAddress : function( address ){
				this.container.publish( 'setAddress', address );
			},

			getToken : function(){
				this.container.publish( 'getToken' );
			},

			clearData : function(){
				this.container.publish( 'clearData' );
			},

			//---- XDomain Event Handlers ----------------------------
			subscribeToHubEvents: function() {
				var self = this;

				this.subscribe( 'tokenErrorReceived', function( event, data ){
					self.onTokenErrorReceived( event, data );
				});
			},

			onTokenErrorReceived: function( event, data ){
				data.errorType = 'TOKENIZATION_ERROR';
				$( this.element ).trigger( 'errorEvent', data );
			}
		}
	);

	return TokenizerWidget;

} );


/*!
* CanJS - 1.1.5 (2013-03-27)
* http://canjs.us/
* Copyright (c) 2013 Bitovi
* Licensed MIT
*/
define('can/util/string/deparam',['can/util/library', 'can/util/string'], function (can) {

    // ## deparam.js  
    // `can.deparam`  
    // _Takes a string of name value pairs and returns a Object literal that represents those params._
    var digitTest = /^\d+$/,
        keyBreaker = /([^\[\]]+)|(\[\])/g,
        paramTest = /([^?#]*)(#.*)?$/,
        prep = function (str) {
            return decodeURIComponent(str.replace(/\+/g, " "));
        };


    can.extend(can, {

        deparam: function (params) {

            var data = {},
                pairs, lastPart;

            if (params && paramTest.test(params)) {

                pairs = params.split('&'),

                can.each(pairs, function (pair) {

                    var parts = pair.split('='),
                        key = prep(parts.shift()),
                        value = prep(parts.join("=")),
                        current = data;

                    if (key) {
                        parts = key.match(keyBreaker);

                        for (var j = 0, l = parts.length - 1; j < l; j++) {
                            if (!current[parts[j]]) {
                                // If what we are pointing to looks like an `array`
                                current[parts[j]] = digitTest.test(parts[j + 1]) || parts[j + 1] == "[]" ? [] : {};
                            }
                            current = current[parts[j]];
                        }
                        lastPart = parts.pop();
                        if (lastPart == "[]") {
                            current.push(value);
                        } else {
                            current[lastPart] = value;
                        }
                    }
                });
            }
            return data;
        }
    });
    return can;
});
define('scripts/components/common/util/page-util',[
	'jquery',
	'can',
	'can/util/string/deparam'
], function( $, can ){

	var PageUtil = {

		getUrlParameter: function( param ){
			var urlParamString = window.location.search.substring(1),
				paramPairs = urlParamString.split( '&' ),
				parameter;

			for( var i=0; i < paramPairs.length; i++ ){

				parameter = paramPairs[ i ].split( '=' );
				if( parameter[ 0 ] === param ){
					return parameter[ 1 ];
				}
			}
		},

		getUrlParameters: function(){
			var urlParamString = window.location.search.substring(1);
			return can.deparam( urlParamString );
		},

		addParamToUrl: function( url, name, value ){
			var prefix, suffix, urlArray, fragment;

			// if param already exists modify value
			if( url.indexOf( name + '=' ) >= 0 ) {
				prefix = url.substring( 0, url.indexOf( name ));
				suffix = url.substring( url.indexOf( name ));
				suffix = suffix.substring( suffix.indexOf( '=' ) + 1 );
				suffix = (suffix.indexOf( '&' ) >= 0) ? suffix.substring( suffix.indexOf( '&' )) : '';
				url = prefix + name + '=' + value + suffix;
			}
			else {
				urlArray = url.split( '#' );
				url = urlArray[ 0 ];
				fragment = urlArray[ 1 ] ? '#' + urlArray[ 1 ] : '';

				url += ( url.indexOf( '?' ) < 0 ) ? '?' : '&'; 
				url += name + '=' + value;
				url += fragment;
			}

			return url;
		},

		removeParamFromUrl: function( url, name ){
			var paramIndex = this.getParamIndex( url, name );
			if( paramIndex > -1 ){
				var prefix = url.substring( 0, paramIndex - 1 ),
					suffix = url.substring( paramIndex ),
					paramDelimiterIndex = suffix.indexOf( '&' ),
					hashDelimiterIndex = suffix.indexOf( '#' ),
					delimiter,
					suffixStartIndex;

				if( paramDelimiterIndex > -1 ){
					delimiter = url.charAt( paramIndex - 1 );
					suffixStartIndex = paramDelimiterIndex + 1;
				} else if ( hashDelimiterIndex > -1 ){
					delimiter = "#";
					suffixStartIndex = hashDelimiterIndex + 1;
				} 
				suffix = suffixStartIndex ? delimiter + suffix.substring( suffixStartIndex ) : '';
				url = prefix + suffix;
			}

			return url;
		},

		//Only return the paramIndex when the param + '=' is found in the url
		//AND the character preceding the param is a valid delimiter ('?', '&', or '#').
		//this prevents a false positive result (for example, for 'homepage' when param name is 'page')
		getParamIndex: function( url, name ){
			var index = -1,
				validDelimiters = [ '?', '&', '#' ],
				paramIndex = url.indexOf( name + '=' ),
				remainder = url.substring( paramIndex ),
				delimiter = url.charAt( paramIndex-1 ),
				delimiterIndex = validDelimiters.indexOf( delimiter );

			if( paramIndex > -1 ){
				if( delimiterIndex > -1 ){
					index = paramIndex;
				} 
			}
			return index;
		}

	};

	return PageUtil;
});

define( 'checkout',[
	'jquery',
	'can',
	'scripts/anyware-widgets/base-widget/base-widget',
	'scripts/components/common/util/page-util',
	'lib/canjs/amd/can/control/plugin',
	'scripts/components/common/util/lang',
	'can-proxy',
	'can-super'
], function( $, can, BaseWidget, PageUtil ) {

	var CheckoutWidget = BaseWidget.extend(

		//Static
		{
			pluginName: 'anyware_checkout',
			appId: 'checkout',

			// EVENTS
			ORDER_VALIDATED_EVENT : 'orderValidated',
			ORDER_COMPLETED_EVENT : 'orderCompleted',
			ORDER_STATUS_CHANGE_EVENT : 'orderStatusChanged',
			PAYMENT_METHOD_SELECTED_EVENT: 'paymentMethodSelected',
			SIGN_OUT_REQUESTED: 'signOutRequested',
			CANCEL_PAGE_REQUESTED: 'cancelPageRequested',
			READY_EVENT : 'ready',

			// THROWN ERRORS
			ERROR_ORDER_NOT_VALIDATED : 'Error! : Order Not In VALIDATED State!',

			UNIVERSAL_APP_PATH: '/anyware/latest/universal/checkout/index.html',
			UNIVERSAL_APP_PATH_LOCAL: '/app/universal/checkout/index.html',

			ORDER_STATUS_VALIDATED: 'VALIDATED'
		},

		//Prototype
		{
			order: {},

			//--------- Init -----------------------------------
			setAdditionalOptions: function(){
				var cartId, payPal;

				//payPalReturnUrl
				if( !$.isValue( this.options.payPalReturnUrl )){
					this.options.payPalReturnUrl = window.location.href;
				}

				//cartId
				if( !$.isValue( this.options.cartId )){
					cartId = PageUtil.getUrlParameter( 'cartId' );
					if( $.isValue( cartId )){
						this.options.cartId = cartId;
					}
				}

				//paypal
				payPal = PageUtil.getUrlParameter( 'paypal' );
				if( $.isValue( payPal )){
					this.options.paypal = payPal;
				}
			},

			//--------- Public Methods --------------------------
			orderValid: function(){
				return( this.order !== undefined && this.order.status === this.constructor.ORDER_STATUS_VALIDATED );
			},

			validateOrder: function(){
				if( this.orderValid() ){
					this.orderValidated( {}, { order: this.order });
				}
				else {
					this.container.publish( 'validateOrder' );
				}
			},

			placeOrder: function() {
				if( this.orderValid() ){
					this.container.publish( 'placeOrder' );
				}
				else {
					throw new Error( this.constructor.ERROR_ORDER_NOT_VALIDATED );
				}
			},

			requiresRedirect: function(){
				var configurationData = this.configurationModel.attr();
				return ( !!configurationData.redirectRequired );
			},

			getRedirectUrl: function(){
				return this.redirectUrl;
			},

			setItems: function( items ){
				this.options.items = items;
				this.options.cartId = null; //no longer valid since we changed the items.
				if( this.isComponentRunning ){
					this.reload();
				}
			},

			updatePayPalReturnUrl: function( payPalReturnUrl ){
				this.options.payPalReturnUrl = payPalReturnUrl || window.location.href;
			},

			//--------- CrossDomain Event Handlers ----------------
			subscribeToHubEvents : function() {
				this.subscribe( 'orderStatusChange', this.proxy( 'orderStatusChange' ));
				this.subscribe( 'orderValidated', this.proxy( 'orderValidated' ));
				this.subscribe( 'orderCompleted', this.proxy( 'orderCompleted' ));
				this.subscribe( 'paymentMethodSelected', this.proxy( 'paymentMethodSelected' ));
				this.subscribe( 'uiReady', this.proxy( 'uiReady' ));
				this.subscribe( 'payPalFlowRequested', this.proxy( 'payPalFlowRequested' ));
				this.subscribe( 'signOutRequested', this.proxy( 'signOutRequested' ));
				this.subscribe( 'cancelPageRequested', this.proxy( 'cancelPageRequested' ));
			},

			orderStatusChange: function( ev, data ){
				this.order = data.order;
				this.triggerEvent( this.constructor.ORDER_STATUS_CHANGE_EVENT, data );
			},

			orderValidated: function( ev, data ){
				this.order = data.order;
				this.triggerEvent( this.constructor.ORDER_VALIDATED_EVENT, data );
			},

			orderCompleted: function( ev, data ){
				this.order = data.order;
				this.triggerEvent( this.constructor.ORDER_COMPLETED_EVENT, data );

				this.unload();
			},

			paymentMethodSelected: function( ev, data ){
				this.order = data.order;
				this.triggerEvent( this.constructor.PAYMENT_METHOD_SELECTED_EVENT, data );
			},

			uiReady: function( ev ){
				this.triggerEvent( this.constructor.READY_EVENT );
			},

			payPalFlowRequested: function( ev, data ){
				var redirectUrl = data.redirectUrl;
				window.location.href = redirectUrl;
			},

			signOutRequested: function( ev, data ){
				this.triggerEvent( this.constructor.SIGN_OUT_REQUESTED, data );
			},

			cancelPageRequested: function( ev, data ){
				this.triggerEvent( this.constructor.CANCEL_PAGE_REQUESTED, data );			
			},

			//Override base-widget to account for non-embedded (Redirect and Universal) flows:
			//Now that configuration data is loaded, 
			//1. Check to see if this is a third-party redirect flow (and set up the redirectUrl accordingly if so),
			//2. Check to see if there's a pending Universal request (meaning that startUniversalCheckout was 
			//called before configuration data finished loading). If so, will call startUniversalCheckout again.
			//
			//Note that things need to happen in this order because (potential refactoring opportunity if this is too brittle):
			//1. checkForRedirect - sets the redirect URL, if applicable
			//2. super onConfigLoaded - sets isConfigLoaded flag to true (referenced by startUniversalCheckout),
			//and also ultimately will perform the redirect (if autoRun is true and there's a redirectUrl).
			//3. checkForPendingUniversalRequest - references the flag set in super onConfigLoaded.
			onConfigLoaded: function(){
				this.checkForRedirect();
				this._super(); 
				this.checkForPendingUniversalRequest();
			},

			//Override base-widget to account for non-embedded (Redirect and Universal) flows:
			//If this is the embedded flow, will call _super (which will load the Checkout app into the iframe).
			//If this is Universal flow, do nothing (wait for startUniversalCheckout to be called).
			//Otherwise this is a third-party (non-Universal) redirect flow, in which case we can move straight
			//onto run if autoRun is true (since we can skip the load step for this flow).
			load: function() {
				if( this.isEmbedded() ){	
					this._super();
				} else if( !this.isUniversalMode() && this.options.autoRun ){
					this.run();
				}
			},

			//Override base-widget to account for Redirect functionality
			run: function(){
				if( this.requiresRedirect() ){
					this.performRedirect();
				} else {
					this._super();
				}
			},

			//used to distinguish the embedded Checkout flow 
			//(where Checkout is loaded into an iframe)
			//from flows where user is redirected 
			//(either to a third-party vendor like Digital River, or to Universal)
			isEmbedded: function(){
				return ( !this.requiresRedirect() && !this.isUniversalMode() );
			},


			//---------------------------------------------------------
			// (Third-Party Store) Redirect Functionality (eg, Digital River)
			// When 'redirectRequired' is true in config file, it means
			// that instead of loading the Anyware app, we'll redirect
			// to the URL indicated by 'redirectUrl'. 
			// This 'redirectUrl' may be be a simple string or a complex
			// object keyed by various initOptions (such as marketSegment)
			//----------------------------------------------------------

			//checkForRedirect is called when config data is loaded.
			//If this is a redirect scenario, will set redirectUrl.
			//Otherwise, redirectUrl will be undefined.
			checkForRedirect: function(){
				if( this.requiresRedirect() ){
					this.setRedirectUrl();
				}
			},

			setRedirectUrl: function(){
				this.redirectOptions = {
					marketSegment: this.getRedirectMarketSegment(),
					languageCode: this.getRedirectLanguageCode()
				};

				var configurationData = this.configurationModel.attr(),
					urlData = configurationData.redirectUrl,
					urlStr = this.parseRedirectUrl( urlData );
				
				this.redirectUrl = this.processRedirectUrl( urlStr );
			},

			//The value for 'redirectUrl' in config data might either be a simple string
			//or an object keyed by initOptions (stored in this.redirectOptions).
			//This function parses that 'redirectUrl' value and ultimately returns the proper URL string.
			parseRedirectUrl: function( urlData ){
				if( $.isString( urlData ) ){
					return urlData;
				} else {
					for (var prop in urlData ){
						return this.parseRedirectUrl( urlData[ prop ][ this.redirectOptions[ prop ] ] );
					}
				}
			},

			//Any vendor-specific processing that needs to happen, happens here.
			//Right now, the only possible value for 'redirectVendor' is 'DIGITAL_RIVER',
			//so that's the only vendor being accounted for here.
			processRedirectUrl: function( url ){
				var configurationData = this.configurationModel.attr(),
					vendor = configurationData.redirectVendor,
					items = this.options.items,
					processedUrl = url;
				
				if( vendor === 'DIGITAL_RIVER' ){
					if( items && items.length === 1 ){
						var productKey = items[ 0 ].productKey;
						processedUrl = url.replace( '<product_key>', productKey );
					} else {
						throw new Error( 'Item Not Found or More than One Item Found' );
					}
				}
				return processedUrl;
			},

			getRedirectMarketSegment: function(){
				return this.options.marketSegment;
			},

			getRedirectLanguageCode: function() {
				var configurationData = this.configurationModel.attr(),
					languageCode = this.options.languageCode,
					supportedLanguages = configurationData.supportedLanguages,
					defaultLanguage = configurationData.defaultLanguage;

				if( !this.isSupportedLanguage( languageCode, supportedLanguages ) ) {
					languageCode = defaultLanguage;
				}
				return languageCode;
			},

			isSupportedLanguage: function( languageCode, supportedLanguages ) {
				var languages = can.makeArray( supportedLanguages );
				return ( $.inArray( languageCode, languages ) > -1 );
			},

			performRedirect: function(){
				var redirectUrl = this.getRedirectUrl();
				if( this.options.autoRedirect ){
					this.redirectToUrl( redirectUrl );
				} else {
					this.triggerEvent( 'redirectToCheckout', redirectUrl );
				}
			},

			redirectToUrl: function( url ){
				window.location = url;
			},

			//---------------------------------------------------------
			// (Universal Checkout) Redirect Functionality
			//----------------------------------------------------------
			isUniversalMode: function(){
				return !!this.options.universalMode;
			},

			startUniversalCheckout: function( options ){
				if( this.configErrorOccurred ){
					return;
				}

				if( this.isConfigured() ){
					this.performUniversalRedirect( options );
				} else {
					this.savePendingUniversalRequest( options );
				}
			},

			performUniversalRedirect: function( options ){
				var universalUrl;
				if( this.requiresRedirect() ){
					this.performRedirect();
				} else {
					universalUrl = this.assembleUniversalUrl( options );
					this.redirectToUrl( universalUrl );
				}
			},

			checkForPendingUniversalRequest: function(){
				if( $.isValue( this.pendingUniversalRequest )){
					this.startUniversalCheckout( this.pendingUniversalRequest.options );
				}
			},

			//if startUniversalCheckout is called before configuration data
			//has been loaded, will store the options that it was called with
			//so it can be called again once configuration data is loaded
			savePendingUniversalRequest: function( options ){
				this.pendingUniversalRequest = {
					options: options
				};
			},

			assembleUniversalUrl: function( options ){
				var escapedParams = this.getUrlParams( options ),
					universalUrl = this.getBaseUrl() + this.getAppPath() + '?' + escapedParams;
					
				return universalUrl;
			},

			getUrlParams: function( options ){
				var params = this.getUniversalParams( options ),
					unnecessaryParams = [ 'debug', 'autoLoad', 'autoRun', 'requiredOptions', 'autoRedirect', 'payPalReturnUrl', 'paypal', 'tunnelPath' ]; //don't pass payPal params to universal.

				if( $.isValue( params.debug ) ){
					if( params.debug ){
						params.compress = false;
					}
				}

				for( var i=0; i<unnecessaryParams.length; i++ ){
					var param = unnecessaryParams[ i ];
					if( $.isValue( params[ param ] ) ){
						delete params[ param ];
					}
				}
				
				return $.param( params );
			},

			//Makes sure the languageCode we're passing is a supported language
			getUniversalParams: function( options ){
				var params = $.extend( true, {}, this.options, options ),
					languageCode =  this.getRedirectLanguageCode(); 

				params.languageCode = languageCode;
				return params;
			},

			getBaseUrl: function(){
				//If isLocal is true, leave baseUrl as an empty string	
				var baseUrl = '',
					configurationData = this.configurationModel.attr();

				if( !this.options.isLocal ){
					baseUrl = configurationData.baseUrl[ this.options.landscape ];
				}
				return baseUrl;
			},

			getAppPath: function(){
				if( this.options.isLocal ){
					return this.constructor.UNIVERSAL_APP_PATH_LOCAL;
				} else {
					return this.constructor.UNIVERSAL_APP_PATH;
				}
			}
		}
	);

	return CheckoutWidget;

} );
define('scripts/anyware-widgets/price-display/price-display-controller',[
	'jquery',
	'can',
	'scripts/anyware-widgets/base-widget/base-widget'
], function( $, can, BaseWidget ){

	var PriceDisplayController = BaseWidget.extend(

		//Static
		{
			pluginName: 'price_display_controller',
			appId: 'priceDisplay',

			requiredOptions: []
		},

		//Prototype
		{
			//---- Price Display Controller API ----------------------------
			getPrices: function( data ){
				this.container.publish( 'getPrices', data );
			}
		}
	);

	return PriceDisplayController;

});
define('price-display',[
	'jquery',
	'can',
	'scripts/anyware-widgets/price-display/price-display-controller',
	'lib/canjs/amd/can/control/plugin',
	'can-super',
	'can-proxy'
], function( $, can, PriceDisplayController ){

	/**
		- MAIN PUBLIC API
		- jquery plugin - anyware_price_display
		- scrapes the dom and collect meta data
		- recieves options during plugin instantiation
		- load price display app - into iframe - and setup xdomain hub
		- passed data to app
		- recieves markup back from app
		- append markup to DOM
	**/
	var AnywarePriceDisplay = can.Control.extend(
	/* @Static */
	{
		pluginName : 'anyware_price_display',
		appId : 'priceDisplay',

		defaults : {
			styles: {
				PRICE_TYPE_LABEL: '',
				FORMATTED_PRICE_CONTAINER: '',
				SUBSCRIPTION_TERM_LABEL: '',
				TAX_LABEL: '',
				ORIGINAL_PRICE: 'EcommPrice_originalPrice',
				CURRENCY_SYMBOL: 'cart-price-currency-symbol',
				INTEGER_PRICE_VALUE: 'cart-price-dollar',
				DECIMAL_PRICE_VALUE: 'cart-price-cent',
				INT_DELIMITER: 'cart-price-integer-delimiter',
				DECIMAL_DELIMITER: 'cart-price-decimal-delimiter',
				PRICE_STYLE: 'CartCostWeak'
			}
		},

		widgetCount : 0,
		numberOfWidgets : 0,

		widgetsByMarketSegment : {"COM":[],"EDU":[]},

		mainControl : null,



		onConfigured : function( event, data ){
			//not sure we care about this - autoload is true
		},		

		onApplicationReady : function( event, data ){
			var priceData = this.getPriceData();

			priceData.options = this.options;
			this.mainControl.getPrices( priceData );
		},

		onPriceLabelsReady : function( event, resultObj ){

			var marketSegmentWidgets = this.widgetsByMarketSegment[resultObj.marketSegment],
				priceLabelDivs = resultObj.priceLabelDivs;

			for(var i=0; i < marketSegmentWidgets.length; i++){

				marketSegmentWidgets[i].element.append(priceLabelDivs[i]);
			}
			
		},

		registerWidget: function( widget, selector ){

			var options,
				widgetMarketSegment;

			if( !this.numberOfWidgets ) {
				this.numberOfWidgets = $( selector ).length;
			}

			widgetMarketSegment = widget.element.data().marketSegment || "COM";

			this.widgetsByMarketSegment[widgetMarketSegment.toUpperCase()].push(widget);

			this.widgetCount++;

			if( !this.mainControl && this.widgetCount === this.numberOfWidgets ) {
				options = widget.options;

				this.createMainControl(  options );
			}
		},


		getPriceData: function(){

			var widgetData, widgetOptions,
				priceData = { "COM":[], "EDU":[] },
				self = this;

			$.each(this.widgetsByMarketSegment, function( marketSegment, widgets ){

				for( var i = 0; i < widgets.length; i++ ) {

					var widget = widgets[ i ];
					widgetOptions = widget.options;
					widgetData = self.getWidgetData( widget );

					priceData[ marketSegment ].push( $.extend( true, {}, widgetOptions, widgetData ));
				}
			});

			return priceData;

		},

		// Gets all of the data- attributes attached to the widget's element
		// except for 'controls' attribute, which causes cross-domain issues 
		// when passed through cross-domain Hub.
		getWidgetData: function( widget ){
			var widgetData = $.extend( true, {}, widget.element.data() );
			widgetData.controls = null;
			return widgetData;
		},

		createMainControl : function( options ) {
			var $elem = $('<div id="price-display-controller" style="height:0px;width:0px"></div>');
			$('body').append( $elem );

			$elem.on( 'configured', $.proxy( this, 'onConfigured' ));
			$elem.on( 'applicationReady', $.proxy( this, 'onApplicationReady' ));
			$elem.on( 'priceLabelsReady', $.proxy( this, 'onPriceLabelsReady' ));

			this.mainControl = new PriceDisplayController( $elem, options );
		},

		destroyMainController : function(){
			$('#price-display-controller').remove();
			this.mainControl = null;
		},

		unregisterWidget: function( widget ){
			var marketSegment = widget.element.data().marketSegment || "COM",
				widgetArray = this.widgetsByMarketSegment[ marketSegment.toUpperCase() ];

			this.widgetCount--;
			this.numberOfWidgets--;

			widgetArray.splice( widgetArray.indexOf( widget ), 1 );		

			if( this.numberOfWidgets === 0 ) {
				this.destroyMainController();
			}
		}


	},
	/* @Prototype */
	{
		init: function() {
			this.constructor.registerWidget( this, this.options.selector );
		},

		destroy: function() {
			this.constructor.unregisterWidget( this );
			this._super();
		}

	});

	return AnywarePriceDisplay;
});
define( 'live-person-chat',[
	'jquery',
	'scripts/anyware-widgets/base-widget/base-widget',
	'lib/canjs/amd/can/control/plugin',
	'can-super'
], function( $, BaseWidget ) {

	var ChatWidget = BaseWidget.extend(

		//Static
		{
			pluginName: 'anyware_live_person_chat',
			appId: 'lpchat',

			IFRAME_ANIMATION_TIME: 400
		},

		//Prototype
		{
			setAdditionalOptions: function(){
				this.options.iframeAttrs = {
					'style': { width:"450px", height:"400px", display: "none" }
				};
			},


			//---- LivePerson Chat API ----------------------------
			chatEventHandler: function( order ){
				try {
					this.container.publish( 'chatEventHandler', order );
				} catch( exception ) {
					// fail silently
				}
			},


			//---- XDomain Event Handlers ----------------------------
			subscribeToHubEvents: function() {
				this.subscribe( 'iframeDisplay', this.proxy( 'onIframeDisplay' ));
			},

			onIframeDisplay: function(ev, data){
				var $iframe = $(".anyware-iframe");
				if(data.display){
					$iframe.show(this.constructor.IFRAME_ANIMATION_TIME);
				}else{
					$iframe.hide(this.constructor.IFRAME_ANIMATION_TIME);
				}
			}
		}
	);

	return ChatWidget;

} );



//Widgets need to be added here so that they're included in the output js file
require([
	'jquery',
	'price-generator',
	'product-configurator',
	'tokenizer', 
	'checkout',
	'price-display',
	'live-person-chat'
], function( $, PriceGenerator ){

	$.createNs( 'Adobe.Anyware' );
	Adobe.Anyware.PriceGenerator = PriceGenerator;

	$(document).trigger( 'anywareReady' );
});
define("scripts/anyware-widgets/anyware-widgets", function(){});

}());