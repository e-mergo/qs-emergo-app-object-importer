/**
 * E-mergo App Object Importer importers
 *
 * @version 20230212
 * @author Laurens Offereins <https://github.com/lmoffereins>
 *
 * @param  {Object} qlik                Qlik's core API
 * @param  {Object} _                   Underscore
 * @param  {Object} $q                  Angular's Q promise library
 * @param  {Object} qUtil               Qlik's utility library
 * @return {Object}                     Importer API
 */
define([
	"qlik",
	"underscore",
	"ng!$q",
	"util"
], function( qlik, _, $q, qUtil ) {

	/**
	 * Holds default import options
	 *
	 * @type {Object}
	 */
	var defaultOptions = {
		importAlternateStates: true
	},

	/**
	 * Holds the current app
	 *
	 * @type {Object}
	 */
	currApp = qlik.currApp(),

	/**
	 * Holds the list of opened apps
	 *
	 * @type {Object}
	 */
	_apps = {},

	/**
	 * Return the opened app
	 *
	 * Use this to make sure always only one connection per app is created.
	 *
	 * @param  {String} appId App identifier
	 * @return {Promise}      App object or rejected when not found
	 */
	openApp = function( appId ) {

		// Bail when no data was provided
		if (! appId) {
			return $q.reject("App with id '".concat(appId, "' not found"));
		}

		// Return when appId already is an app
		if (appId.id) {
			return $q.resolve(appId);
		}

		// Set current app
		if (! _apps.hasOwnProperty(currApp.id)) {
			_apps[currApp.id] = $q.resolve(currApp);
		}

		// Load the requested app
		if (! _apps.hasOwnProperty(appId)) {
			var app = qlik.openApp(appId, { openWithoutData: true });

			_apps[appId] = app.model.waitForOpen.promise.then( function() {
				var dfd = $q.defer();

				// No way was found to listen for the event that the app's layout is
				// loaded, so a delay is applied to ensure the API request must have
				// returned any value.
				setTimeout(function() { dfd.resolve(app); }, 120);

				return dfd.promise;
			});
		}

		return _apps[appId];
	},

	/**
	 * Holds import functions for script sections
	 *
	 * @type {Object}
	 */
	script = {
		/**
		 * Add a script section in the app
		 *
		 * @param  {Object} props Script properties
		 * @return {Promise} Script section added
		 */
		add: function( props ) {
			return currApp.getScript().then( function( data ) {
				var tabs = data.qScript.split("///$tab ").filter(Boolean).map( function( a, index ) {
					return a.split("\r\n")[0];
				}), tab = props.tab, i = 0;

				// Consider existing tab titles before adding
				while (-1 !== tabs.indexOf(tab)) {
					tab = props.tab.concat(" (".concat(++i, ")"));
				}

				// Construct the new section, add to script
				var section = "///$tab ".concat(tab, "\r\n", props.qScript),
				    script = data.qScript.concat(section);

				// Extend and save the new script
				return currApp.setScript(script);
			});
		},

		/**
		 * Update a script section in the app
		 *
		 * @param  {Object} props   Script properties
		 * @param  {Object} options Optional. Import options.
		 * @return {Promise} Script section updated
		 */
		update: function( props, options ) {
			options = options || {};

			return currApp.getScript().then( function( data ) {
				var sections = data.qScript.split("///$tab ").filter(Boolean).map( function( a ) {
					return {
						tab: a.split("\r\n")[0],
						section: "///$tab ".concat(a)
					}
				}),

				// Find target by section title
				target = _.findIndex(sections, function( a ) {
					return a.tab === options.targetId;
				});

				if (-1 !== target) {

					// Update the section
					sections[target].section = "///$tab ".concat(options.targetId, "\r\n", props.qScript);

					// Construct the new script
					var script = sections.reduce( function(a, b) {
						return a.concat(b.section);
					}, "");

					// Save the new script
					return currApp.setScript(script);
				} else {
					return $q.reject("Script section not updated: could not find section with title '".concat(options.targetId, "'"));
				}
			});
		}
	},

	/**
	 * Holds import functions for sheets
	 *
	 * @type {Object}
	 */
	sheet = {
		/**
		 * Add a sheet in the app
		 *
		 * @param  {Object} props   Sheet properties
		 * @param  {Object} options Optional. Import options
		 * @return {Promise} Sheet added
		 */
		add: async function( props, options ) {
			var requirements = {}, appToImportFrom;

			options = _.defaults(options || {}, defaultOptions);

			// Updating, so load target object
			if (options.targetId) {
				requirements.targetObject = currApp.getObject(options.targetId);
			}

			// Load sheet objects?
			if (! options.sheetObjects && options.appId) {
				appToImportFrom = await openApp(options.appId);
				options.sheetObjects = [];

				// Load objects from cells
				requirements.sheetObjects = props.cells.reduce( function( promise, cell ) {
					return promise.then( function() {

						// Using `getObjectProperties` fetches both properties and the propertyTree when applicable
						return appToImportFrom.getObjectProperties(cell.name).then( function( a ) {
							options.sheetObjects.push(a.propertyTree || { qChildren: [], qProperty: a.properties });
						});
					});
				}, $q.resolve());
			}

			// Import alternate states?
			if (options.importAlternateStates) {
				requirements.alternateStates = alternateState.add(props.qStateName);
			}

			// Load required assets first
			return $q.all(requirements).then( function( args ) {
				var dfd = $q.defer(), newSheetObject;

				// Updating, so save the new properties in the target object
				if (options.targetId) {
					newSheetObject = args.targetObject.setProperties(props).then( function() {
						return args.targetObject;
					});

				// Adding, so create a new object with properties
				} else {

					// Push the rank to the end of the list
					if (options.sheetsMaxRank) {
						props.rank = options.sheetsMaxRank + 1;
					}

					newSheetObject = currApp.model.engineApp.createObject(props);
				}

				// With the new sheet object, register the new property tree
				newSheetObject.then( function( sheet ) {
					sheet = (options.targetId ? sheet : sheet.qInfo);

					// Get the full property tree
					sheet.getFullPropertyTree().then( function( propertyTree ) {

						// Set visualizations in the sheet
						propertyTree.qChildren = options.sheetObjects;

						// Save the new property tree
						sheet.setFullPropertyTree(propertyTree).then(dfd.resolve);
					});
				});

				return dfd.promise;
			});
		},

		/**
		 * Update a sheet in the app
		 *
		 * Sheet updates are based on the `targetId` option.
		 *
		 * @param  {Object} props Sheet properties
		 * @param  {Object} options Optional. Import options
		 * @return {Promise} Sheet updated
		 */
		update: function( props, options ) {
			if (options.targetId) {
				return this.add(props, options);
			} else {
				return $q.reject("Sheet not updated: missing id of the target sheet");
			}
		}
	},

	/**
	 * Holds import functions for master dimensions
	 *
	 * @type {Object}
	 */
	dimension = {
		/**
		 * Add a master dimension in the app
		 *
		 * @param  {Object} props Dimension properties
		 * @return {Promise} Dimension added
		 */
		add: function( props ) {
			return currApp.model.engineApp.createDimension(props);
		},

		/**
		 * Update a master dimension in the app
		 *
		 * @param  {Object} props   Dimension properties
		 * @param  {Object} options Optional. Import options.
		 * @return {Promise} Dimension updated
		 */
		update: function( props, options ) {
			options = options || {};

			return currApp.model.engineApp.getDimension(options.targetId || props.qInfo.qId).then( function( targetObject ) {

				// Update the target's properties
				return targetObject.setProperties(props);
			});
		}
	},

	/**
	 * Holds import functions for master measures
	 *
	 * @type {Object}
	 */
	measure = {
		/**
		 * Add a master measure in the app
		 *
		 * @param  {Object} props Measure properties
		 * @return {Promise} Measure added
		 */
		add: function( props ) {
			return currApp.model.engineApp.createMeasure(props);
		},

		/**
		 * Update a master measure in the app
		 *
		 * @param  {Object} props   Measure properties
		 * @param  {Object} options Optional. Import options.
		 * @return {Promise} Measure updated
		 */
		update: function( props, options ) {
			options = options || {};

			return currApp.model.engineApp.getMeasure(options.targetId || props.qInfo.qId).then( function( targetObject ) {

				// Update the target's properties
				return targetObject.setProperties(props);
			});
		}
	},

	/**
	 * Holds import functions for master objects (visualizations)
	 *
	 * @type {Object}
	 */
	masterObject = {
		/**
		 * Add a master object in the app
		 *
		 * @param  {Object} props Master object properties
		 * @return {Promise} Master object added
		 */
		add: function( props ) {
			return currApp.model.engineApp.createObject(props);
		},

		/**
		 * Update a master object in the app
		 *
		 * @param  {Object} props   Master object properties
		 * @param  {Object} options Optional. Import options.
		 * @return {Promise} Master object updated
		 */
		update: function( props, options ) {
			options = options || {};

			return currApp.model.engineApp.getObject(options.targetId || props.qInfo.qId).then( async function( targetObject ) {
				var originApp = await openApp(options.appId);

				// Get the origin's property tree
				return originApp.getFullPropertyTree(props.qInfo.qId).then( function( a ) {

					// Keep the target's id
					var propertyTree = a.propertyTree;
					propertyTree.qProperty.qInfo.qId = options.targetId;

					// Update the target's property tree
					return targetObject.setFullPropertyTree(propertyTree);
				});
			});
		}
	},

	/**
	 * Holds import functions for alternate states
	 *
	 * @type {Object}
	 */
	alternateState = {
		/**
		 * Add an alternate state in the app
		 *
		 * The action will fail silently if the state already exists.
		 *
		 * @param  {String} qStateName Alternate state name
		 * @param  {Object} options    Optional. Import options.
		 * @return {Promise} Alternate state added
		 */
		add: function( qStateName, options ) {
			return currApp.model.engineApp.addAlternateState(qStateName);
		},

		/**
		 * Proxy for adding alternate states. There is no updating available.
		 *
		 * The action will fail silently if the state already exists.
		 *
		 * @param  {String} qStateName Alternate state name
		 * @param  {Object} options    Optional. Import options.
		 * @return {Promise} Alternate state added
		 */
		update: function( qStateName, options ) {
			return this.add(qStateName, options);
		}
	},

	/**
	 * Holds import functions for variables
	 *
	 * @type {Object}
	 */
	variable = {
		/**
		 * Add a variable in the app
		 *
		 * The action may be rejected because the variable already exists based on name.
		 *
		 * @param  {Object} props Variable properties
		 * @return {Promise} Variable added
		 */
		add: function( props ) {

			// Imported variables are not created in script
			delete props.qIsScriptCreated;

			return currApp.model.engineApp.createVariableEx(sanitizeObjectData(props));
		},

		/**
		 * Update a variable in the app
		 *
		 * By default the variable is updated based on the variable name. Provide
		 * `options.targetId` to update the variable based on id.
		 *
		 * @param  {Object} props   Variable properties
		 * @param  {Object} options Optional. Import options.
		 * @return {Promise} Variable updated
		 */
		update: function( props, options ) {
			options = options || {};

			// Update based on id or name
			var getVariable = currApp.model.engineApp[options.targetId ? "getVariableById" : "getVariableByName"](options.targetId || props.qName);

			return getVariable.then( function( targetObject ) {

				// Update the object's properties
				return targetObject.getProperties().then( function() {

					// Keep the target's id
					props.qInfo.qId = targetObject.properties.qInfo.qId;

					// Updated variables may have been created in script
					props.qIsScriptCreated = !! targetObject.properties.qIsScriptCreated;

					// Update the object's properties
					return targetObject.setProperties(props);
				});
			}).catch( function( error ) {

				// Variable is not found, because it doesn't exist. Try adding it instead
				return variable.add(props);
			});
		}
	},

	/**
	 * Remove server publish metadata of the original item
	 *
	 * @param  {Object} qData Object data
	 * @return {Object} Sanitized object data
	 */
	sanitizeObjectData = function( qData ) {

		// Remove metafields that relate to publishing
		qData.qMetaDef = _.omit(qData.qMetaDef, [
			"createdDate",
			"modifiedDate",
			"published",
			"publishTime",
			"approved",
			"owner",
			"sourceObject",
			"draftObject",
			"privileges"
		]);

		// Remove generated metadata
		qData = _.omit(qData, "qMeta");

		return qData;
	};

	return {
		script: script,
		sheet: sheet,
		dimension: dimension,
		measure: measure,
		masterObject: masterObject,
		"alternate-state": alternateState,
		variable: variable
	};
});
