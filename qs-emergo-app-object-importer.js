/**
 * E-mergo App Object Importer Extension
 *
 * @since 20190920
 * @author Laurens Offereins <https://github.com/lmoffereins>
 *
 * @param  {Object} qlik                Qlik's core API
 * @param  {Object} qvangular           Qlik's Angular implementation
 * @param  {Object} axios               Axios HTTP library
 * @param  {Object} _                   Underscore
 * @param  {Object} $q                  Angular's Q promise library
 * @param  {Object} translator          Qlik's translation API
 * @param  {Object} Resize              Qlik's resize API
 * @param  {Object} props               Property panel definition
 * @param  {Object} initProps           Initial properties
 * @param  {Object} importers           Import functions
 * @param  {Object} appInfo             App information functions
 * @param  {Object} util                E-mergo utility functions
 * @param  {Object} uiUtil              E-mergo UI utility functions
 * @param  {String} css                 Extension stylesheet
 * @param  {String} tmpl                Extension template file
 * @param  {String} modalTmpl           Extension modal template file
 * @return {Object}                     Extension structure
 */
define([
	"qlik",
	"qvangular",
	"axios",
	"underscore",
	"ng!$q",
	"translator",
	"core.utils/resize",
	"./properties",
	"./initial-properties",
	"./importers",
	"./util/app-info",
	"./util/util",
	"./util/ui-util",
	"text!./style.css",
	"text!./template.ng.html",
	"text!./modal.ng.html"
], function( qlik, qvangular, axios, _, $q, translator, Resize, props, initProps, importers, appInfo, util, uiUtil, css, tmpl, modalTmpl ) {

	// Add global styles to the page
	util.registerStyle("qs-emergo-app-object-importer", css);

	/**
	 * Holds the reference to the current app's API
	 *
	 * @type {Object}
	 */
	var currApp = qlik.currApp(),

	/**
	 * Holds the objects of the current app
	 *
	 * @type {Object}
	 */
	currAppObjects = {
		load: function() {
			return $q.all({
				script: getScriptInfo(currApp),
				sheet: getSheetInfo(currApp),
				dimension: getDimensionInfo(currApp),
				measure: getMeasureInfo(currApp),
				masterObject: getMasterObjectInfo(currApp),
				"alternate-state": getAlternateStateInfo(currApp),
				variable: getVariableInfo(currApp)
			}).then( function( args ) {
				for (var i in args) {
					currAppObjects[i] = args[i];
				}
			}).catch(console.error);
		}
	},

	/**
	 * Return whether the item already exists in the current app
	 *
	 * @param  {Object} item Object item
	 * @return {Boolean} Item exists
	 */
	doesItemExistInCurrentApp = function( item ) {
		var exists = false;

		if (item.type && currAppObjects[item.type]) {
			switch (item.type) {
				case "script":
					exists = _.some(currAppObjects[item.type], function( a ) {
						return a.code.script.value === item.code.script.value;
					});
					break;

				case "sheet":
					exists = _.some(currAppObjects[item.type], function( a ) {
						return a.properties.qMetaDef.title === item.properties.qMetaDef.title;
					});
					break;

				case "dimension":
					exists = _.some(currAppObjects[item.type], function( a ) {
						return a.properties.qMetaDef.title === item.properties.qMetaDef.title;
					});
					break;

				case "measure":
					exists = _.some(currAppObjects[item.type], function( a ) {
						return a.properties.qMetaDef.title === item.properties.qMetaDef.title;
					});
					break;

				case "masterObject":
					exists = _.some(currAppObjects[item.type], function( a ) {
						/*
						 * NB: comparing masterobjects is quite impossible with objects that reference
						 * other objects outside of them (like filterpanes do). So stick to matching
						 * search terms for now.
						 */
						return a.properties.qMetaDef.title === item.properties.qMetaDef.title
							&& a.properties.visualization === item.properties.visualization
							&& a.searchTerms === item.searchTerms;
					});
					break;

				case "alternate-state":
					exists = _.some(currAppObjects[item.type], function( a ) {
						return a.id === item.id;
					});
					break;

				case "variable":
					exists = _.some(currAppObjects[item.type], function( a ) {
						return a.properties.qName === item.properties.qName
							&& a.properties.qDefinition === item.properties.qDefinition;
					});
					break;
			}
		}

		return exists;
	},

	/**
	 * Return whether the item is importable in the current app
	 *
	 * @param  {Object} item Object item
	 * @return {Boolean} Item is importable
	 */
	isItemImportableInCurrentApp = function( item ) {
		var importable = true;

		if (item.type && currAppObjects[item.type]) {
			switch (item.type) {

				// Cannot import identical states
				case "alternate-state":
					importable = _.every(currAppObjects[item.type], function( a ) {
						return a.id !== item.id;
					});
					break;

				// Cannot import variables with identical names
				case "variable":
					importable = _.every(currAppObjects[item.type], function( a ) {
						return a.properties.qName !== item.properties.qName;
					});
					break;
			}
		}

		return importable;
	},

	/**
	 * Return the first object's id for which the item is updatable in the current app
	 *
	 * @param  {Object} item Object item
	 * @return {String} Updatable object id
	 */
	getTargetIdIfItemIsUpdatableInCurrentApp = function( item ) {
		var targetId;

		if (item.type && currAppObjects[item.type]) {
			switch (item.type) {
				case "script":
					targetId = currAppObjects[item.type].filter( function( a ) {
						// Check by title and script
						return a.label === item.label
							&& a.code.script.value !== item.code.script.value;
					}).map( function( a ) {
						return {
							id: a.label
						};
					});
					break;

				case "sheet":
				    var _item = _.omit(item.properties, "qInfo");
				    _item.cells = _item.cells.map( function( a ) { return _.omit(a, "name"); });

					targetId = currAppObjects[item.type].filter( function( a ) {
						var _a = _.omit(a.properties, "qInfo");
					    _a.cells = _a.cells.map( function( b ) { return _.omit(b, "name"); });

						// Check by title and definition without cell names
						return a.properties.qMetaDef.title === item.properties.qMetaDef.title
							&& JSON.stringify(_a) !== JSON.stringify(_item);
					});
					break;

				case "dimension":
					targetId = currAppObjects[item.type].filter( function( a ) {
						// Check by title and definition
						return a.properties.qMetaDef.title === item.properties.qMetaDef.title
							&& JSON.stringify(a.properties.qDim) !== JSON.stringify(item.properties.qDim);
					});
					break;

				case "measure":
					targetId = currAppObjects[item.type].filter( function( a ) {
						// Check by title and definition
						return a.properties.qMetaDef.title === item.properties.qMetaDef.title
							&& JSON.stringify(a.properties.qMeasure) !== JSON.stringify(item.properties.qMeasure);
					});
					break;

				case "masterObject":
				    var _item = _.omit(item.properties, "qInfo");

					targetId = currAppObjects[item.type].filter( function( a ) {
						var _a = _.omit(a.properties, "qInfo");

						// Check by title and definition
						return a.properties.qMetaDef.title === item.properties.qMetaDef.title
							&& JSON.stringify(_a) !== JSON.stringify(_item);
					});
					break;

				case "variable":
				    var _item = _.omit(item.properties, ["qInfo", "qMeta", "qIsScriptCreated"]);

					targetId = currAppObjects[item.type].filter( function( a ) {
						var _a = _.omit(a.properties, ["qInfo", "qMeta", "qIsScriptCreated"]);

						// Check by title and definition
						return a.properties.qName === item.properties.qName
							&& JSON.stringify(_a) !== JSON.stringify(_item);
					});
					break;
			}
		}

		// Get the first item id when found
		targetId = targetId && targetId.length ? targetId[0].id : "";

		return targetId;
	},

	/**
	 * Define additional parameters on an app object's item
	 *
	 * @param  {Object} item App object item
	 * @return {Object} Item
	 */
	prepareItem = function( item ) {
		var details = [], i;

		// Define item statuses
		item.updatableTargetId = getTargetIdIfItemIsUpdatableInCurrentApp(item);
		item.status = {
			selected: false,
			exists: doesItemExistInCurrentApp(item),
			importable: isItemImportableInCurrentApp(item),
			importing: false,
			imported: false,
			importFailed: false,
			updatable: !! item.updatableTargetId,
			updating: false,
			updated: false,
			updateFailed: false
		};

		// Add tags to search terms
		item.searchTerms = item.searchTerms || "";
		if (item.details && item.details.tags) {
			item.searchTerms += item.details.tags.value.join(" ").concat(" ");
		}

		// Transform details to objects of name/label/value
		for (i in item.details || {}) {

			// Only list defined values
			if (item.details.hasOwnProperty(i) && null !== item.details[i] && "undefined" !== typeof item.details[i]) {
				value = (item.details[i].hasOwnProperty && item.details[i].hasOwnProperty("value")) ? item.details[i].value : item.details[i];

				if (false === value || (value && value.length)) {
					details.push({
						name: i,
						label: item.details[i].label || i[0].toUpperCase().concat(i.substr(1)),
						value: Array.isArray(value) ? value : [value],
						isCode: !! item.details[i].isCode
					});
				}
			}
		}

		// Overwrite previously defined details to make it an array of labeled values
		item.details = details;

		return item;
	},

	/**
	 * Get the app's script information
	 *
	 * @param  {Object} app An app's API
	 * @return {Promise}    List of app script sections
	 */
	getScriptInfo = function( app ) {
		var dfd = $q.defer();

		return appInfo.script(app.id).then( function( info ) {
			return info.map( function( a ) {
				a.code = a.code || {};

				// Set item type
				a.type = "script";

				// Setup code from script
				if (a.hasOwnProperty("script") && ! a.code.hasOwnProperty("script")) {
					a.code.script = {
						label: "Script",
						value: a.script
					};
				}

				// Proxy for item properties
				a.properties = {
					tab: a.label,
					qScript: a.script
				};

				return a;
			});
		});
	},

	/**
	 * Get the app's sheet information
	 *
	 * @param  {Object}  app     The app's API
	 * @param  {Object}  options Optional. Whether to load sheet objects. Defaults to True.
	 * @return {Promise}         List of app sheets
	 */
	getSheetInfo = function( app, options ) {
		return appInfo.sheets(app.id, _.defaults(options || {}, {
			loadWithObjects: true,
			includeSummary: false
		})).then( function( info ) {
			return info.map( function( a ) {

				// Set item type
				a.type = "sheet";

				// Define preview
				a.preview = {
					url: getSingleSheetUrl({
						appId: app.id,
						sheetId: a.id,
						opts: "nointeraction,noselections"
					})
				};

				return a;
			});
		});
	},

	/**
	 * Get the app's dimension information
	 *
	 * @param  {Object} app The app's API
	 * @return {Promise}    List of app dimensions
	 */
	getDimensionInfo = function( app ) {
		return appInfo.dimensions(app.id).then( function( info ) {
			return info.map( function( a ) {

				// Set item type
				a.type = "dimension";

				// Define additional search terms
				if (a.details && a.details.definition) {
					a.searchTerms = a.details.definition.value.concat(" ");
				}

				return a;
			});
		});
	},

	/**
	 * Get the app's measure information
	 *
	 * @param  {Object} app The app's API
	 * @return {Promise}    List of app measures
	 */
	getMeasureInfo = function( app ) {
		return appInfo.measures(app.id).then( function( info ) {
			return info.map( function( a ) {

				// Set item type
				a.type = "measure";

				// Define additional search terms
				if (a.details && a.details.expression) {
					a.searchTerms = a.details.expression.value.concat(" ");
				}

				return a;
			});
		});
	},

	/**
	 * Get the app's visualization (master object) information
	 *
	 * @param  {Object} app The app's API
	 * @return {Promise}    List of app masterObjects (master objects)
	 */
	getMasterObjectInfo = function( app ) {
		return appInfo.masterObjects(app.id).then( function( info ) {
			return info.map( function( a ) {
				var data, i;

				// Set item type
				a.type = "masterObject";

				if (a.children && a.children.length) {
					data = appInfo.getChildrenDataDefinition(a.children);
				} else {
					data = appInfo.getDataDefinition(a.properties);
				}

				// Setup string for additional search terms
				a.searchTerms = "";

				for (i in data) {
					if (data.hasOwnProperty(i)) {
						a.details[i] = data[i];

						// Define additional search terms
						a.searchTerms += data[i].value.join(" ").concat(" ");
					}
				}

				// Define preview
				a.preview = {
					url: getSingleVizUrl({
						appId: app.id,
						objId: a.properties.qInfo.qId,
						opts: "nointeraction,noselections"
					})
				};

				return a;
			});
		});
	},

	/**
	 * Get the app's alternate states information
	 *
	 * @param  {Object} app The app's API
	 * @return {Promise}    List of app alternate states
	 */
	getAlternateStateInfo = function( app ) {
		return appInfo.alternateStates(app.id).then( function( states ) {
			return states.map( function( a ) {

				// Set item type
				a.type = "alternate-state";

				// Proxy for item properties
				a.properties = a.id;

				return a;
			});
		});
	},

	/**
	 * Get the app's variables information
	 *
	 * @param  {Object} app The app's API
	 * @return {Promise}    List of app variables
	 */
	getVariableInfo = function( app ) {
		return appInfo.variables(app.id, { qIsReserved: false }).then( function( info ) {

			// Hide reserved/system vars
			return info.map( function( a ) {

				// Set item type
				a.type = "variable";

				// Define additional search terms
				if (a.details && a.details.definition) {
					a.searchTerms = a.details.definition.value.concat(" ");
				}

				return a;
			});
		});
	},

	/**
	 * Get the app's list of field names
	 *
	 * @param  {Object} app The app's API
	 * @return {Promise}    List of app field names
	 */
	getFieldNames = function( app ) {
		return app.getList("FieldList").then( function ( sessionObject ) {

			// Remove updates for this session object before going forward
			return sessionObject.close().then( function() {

				// Get list items
				return _.pluck(sessionObject.layout.qFieldList.qItems, "qName");
			});
		});
	},

	/**
	 * Return the field's values found in the set definition
	 *
	 * @param  {String} set       Set definition to extract from
	 * @param  {String} fieldName The field's name
	 * @return {Array}            Field values
	 */
	getValuesFromSetAnalysis = function( set, fieldName ) {
		var regex = new RegExp('(<|,)'.concat(fieldName, '={([^}]+)(}>|},)')),
		    matches = set.match(regex);

		// Get array from string list
		return matches[2].split(",").map( function( a ) {

			// Remove surrounding single quotes
			return a.replace(/^'(.*)'$/, "$1");
		});
	},

	/**
	 * Holds the global session options
	 *
	 * @type {Object}
	 */
	globalOpts = currApp.global.session.options,

	/**
	 * Holds the app's global baseURI
	 *
	 * Differs from qUtil.baseURI in that it does not assume the 'sense' project
	 * directly following the prefix. This is relevant for setting up `single` urls.
	 *
	 * @return {String}
	 */
	baseURI = (globalOpts.isSecure ? "https://" : "http://").concat(globalOpts.host, globalOpts.port ? ":" : "", globalOpts.port, globalOpts.prefix.replace(/\/+$/g, ""), "/"),

	/**
	 * Return the url for a single sheet
	 *
	 * @param  {Object} options Url options
	 * @return {String} Single sheet url
	 */
	getSingleSheetUrl = function( options ) {
		options = options || {};
		options.opts = options.opts || "nointeraction,noselections";

		return baseURI.concat("single/?appid=", encodeURIComponent(options.appId), "&sheet=", options.sheetId, "&opt=", options.opts);
	},

	/**
	 * Return the url for a single visualization object
	 *
	 * @param  {Object} options Url options
	 * @return {String} Single visualization url
	 */
	getSingleVizUrl = function( options ) {
		options = options || {};
		options.opts = options.opts || "nointeraction,noselections";

		return baseURI.concat("single/?appid=", encodeURIComponent(options.appId), "&obj=", options.objId, "&opt=", options.opts);
	},

	/**
	 * Holds the list of assets in the inspector modal
	 *
	 * @type {Array}
	 */
	assets = [{
		"id": "script",
		"label": translator.get("Script") // Translation available?
	}, {
		"id": "sheet",
		"label": translator.get("Common.Sheets")
	}, {
		"id": "dimension",
		"label": translator.get("Common.MasterDimensions")
	}, {
		"id": "measure",
		"label": translator.get("Common.MasterMeasures")
	}, {
		"id": "masterObject",
		"label": translator.get("library.Visualizations")
	}, {
		"id": "alternate-state",
		"label": translator.get("Common.AlternateStates")
	}, {
		"id": "variable",
		"label": translator.get("Common.Variables")
	}],

	/**
	 * Return the asset's label
	 *
	 * @param  {String} id Asset id
	 * @return {String} Asset label
	 */
	getAssetLabel = function( id ) {
		return _.first(_.pluck(_.where(assets, { id: id }), "label"));
	},

	/**
	 * Holds the loaded apps
	 *
	 * This is loaded once when calling `currApp.global.getAppList()` to
	 * prevent max listener errors on the related event emitter - or when
	 * calling the Qlik Cloud's REST API to speed up interactivy.
	 *
	 * @type {Array}
	 */
	appList = (function( list ) {
		// Qlik Cloud
		if (util.isQlikCloud) {

			/**
			 * Listed apps may be locked for the user. This is the same behavior as in Qlik
			 * Cloud's app catalog.
			 *
			 * @link https://qlik.dev/apis/rest/items
			 */
			axios("/api/v1/items?resourceType=app&noActions=true").then( function( resp ) {
				function getNext( resp ) {

					// Append items to already returned list
					Array.prototype.push.apply(list, resp.data.map( function( a ) {
						return {
							value: a.name,
							label: a.name,
							id: a.resourceId
						};
					}));

					if (resp.links && resp.links.next && resp.links.next.href) {
						return axios(resp.links.next.href).then( function( resp ) {
							return getNext(resp.data);
						});
					}
				}

				return getNext(resp.data);
			}).catch(console.error);

		// QS Client Managed or QS Desktop
		} else {
			currApp.global.getAppList( function( items ) {
				Array.prototype.push.apply(list, items.map( function( a ) {
					return {
						value: a.qTitle,
						label: a.qTitle,
						id: a.qDocId
					};
				}));
			}, { openWithoutData: true });
		}

		return list;
	})([]),

	/**
	 * Extension controller function
	 *
	 * @param  {Object} $scope Extension scope
	 * @param  {Object} $el Scope's jQuery element
	 * @return {Void}
	 */
	controller = ["$scope", "$element", function( $scope, $el ) {

		/**
		 * Define a two-tiered state-machine for handling events
		 *
		 * @type {StateMachine}
		 */
		var fsm = new util.StateMachine({
			transitions: [{
				from: "IDLE", to: "MODAL", name: "OPEN"
			}, {
				from: "MODAL", to: "IDLE", name: "CLOSE"
			}],
			on: {
				enterModal: function( lifecycle, app ) {

					// Wait for the current app objects to be loaded
					currAppObjects.load().then( function() {
						showAppObjectImporterForApp(app);
					}).catch( function( error ) {
						console.error(error);

						qvangular.getService("qvConfirmDialog").show({
							title: "Importer error",
							message: "Inspect the browser's console for any relevant error data.",
							hideCancelButton: true
						});
					});
				}
			}
		}),

		/**
		 * Holds the modal for the app object importer
		 *
		 * @type {Object}
		 */
		modal,

		/**
		 * Define the app popover
		 *
		 * @return {Object} Popover methods
		 */
		popover = uiUtil.uiSearchableListPopover({
			title: translator.get("QCS.Common.Browser.Filter.ResourceType.Value.app"),
			get: function( setItems ) {

				// Wait for appList to be defined
				var interval = setInterval( function() {
					if ("undefined" !== typeof appList) {
						setItems(appList);
						clearInterval(interval);

						// Refresh view to show the list, because calling `setItems()` does not
						// display the list contents - by default it is only displayed after
						// subsequent user interaction.
						qvangular.$rootScope.$digest();
					}
				}, 150);
			},
			select: function( item ) {
				fsm.open(item);
			},
			alignTo: function() {
				return $el.find(".open-button")[0];
			},
			closeOnEscape: true,
			outsideIgnore: ".open-button",
			dock: "right"
		}),

		/**
		 * Open the object app importer modal for the selected app
		 *
		 * @param  {Object} appData Selected app
		 * @return {Void}
		 */
		showAppObjectImporterForApp = function( appData ) {

			// Open the modal
			modal = qvangular.getService("luiDialog").show({
				controller: ["$scope", function( $scope ) {
					var dfd = $q.defer(),

					/**
					 * Return whether the search query matches with the input value
					 *
					 * @param  {String} input Text
					 * @return {Boolean} Search query matches the text
					 */
					matchSearchQuery = function( input ) {
						return (!! input) && -1 !== input.toString().toLowerCase().indexOf( $scope.search.query.toString().toLowerCase() );
					},

					/**
					 * Process an item's import
					 *
					 * @param {Object}   item Item data
					 * @param {Function} importer Import callback. Should return a Promise.
					 * @return {Promise} Item import was processed
					 */
					importSingleItem = function( item, importer ) {
						if (! item.status.imported && ! item.status.importFailed && item.status.importable) {
							item.status.importing = true;

							return importer().then( function() {
								item.status.exists = true;
								item.status.importing = false;
								item.status.imported = true;
							}).catch( function( error ) {
								console.error(error);
								item.status.importing = false;
								item.status.importFailed = true;
							});
						} else {
							return $q.resolve();
						}
					},

					/**
					 * Process an item's update
					 *
					 * @param {Object}   item Item data
					 * @param {Function} updater Update callback. Should return a Promise.
					 * @return {Promise} Item update was processed
					 */
					updateSingleItem = function( item, updater ) {
						if (! item.status.updated && ! item.status.updateFailed && item.status.updatable) {
							item.status.updating = true;

							return updater().then( function() {
								item.status.exists = true;
								item.status.updating = false;
								item.status.updated = true;
								item.status.updatable = false;
							}).catch( function( error ) {
								console.error(error);
								item.status.updating = false;
								item.status.updateFailed = true;
							});
						} else {
							return $q.resolve();
						}
					},

					// Connect with the provided app
					app = qlik.openApp(appData.id);

					// Setup scope labels and flags
					$scope.okLabel = $scope.input.okLabel || translator.get("Common.Done");
					$scope.cancelLabel = $scope.input.cancelLabel || translator.get("Common.Cancel");
					$scope.loading = true;

					// Assets and items
					$scope.activeAsset = "sheet";
					$scope.activeItem = null;
					$scope.activeSubItem = null;
					$scope.activeSubItemIx = 0;
					$scope.assets = assets;
					$scope.allItems = {};
					$scope.filteredItems = {};
					$scope.selected = [];
					$scope.search = {
						query: ""
					};
					$scope.status = {
						selected: false,
						importing: false,
						imported: false,
						importFailed: false
					};

					/**
					 * Handle when an asset is clicked
					 *
					 * @param  {String} assetId Asset identifier
					 * @return {Void}
					 */
					$scope.assetClicked = function( assetId ) {

						// Clear active item when changing the asset type
						if ($scope.activeAsset !== assetId) {
							$scope.activeItem = null;
							$scope.status.imported = false;

							// Deselect all
							$scope.status.selected = false;
							$scope.allItems[$scope.activeAsset].forEach( function( item ) {
								item.status.selected = false;
							});
						}

						// Set active asset
						$scope.activeAsset = assetId;

						// Set the selected items
						if ($scope.filteredItems.hasOwnProperty(assetId)) {
							$scope.selected = $scope.filteredItems[assetId];

							// Only update active item when not available in filtered list
							if (null === $scope.activeItem || -1 === $scope.selected.indexOf($scope.activeItem)) {
								$scope.activeItem = $scope.selected[0];
							}

							// Reset subitem
							$scope.subItemClicked(0);
						}
					};

					/**
					 * Handle when a item is clicked
					 *
					 * @param  {Object} item Item data
					 * @return {Void}
					 */
					$scope.itemClicked = function( item ) {

						// Set active item
						$scope.activeItem = item;

						// Reset subitem
						$scope.subItemClicked(0);
					};

					/**
					 * Wrapper for an item label
					 *
					 * @param  {Object} item Item data
					 * @return {String} Item label
					 */
					$scope.itemLabel = function( item ) {
						var label = item.label;

						if ("errors" === $scope.activeAsset) {
							label = getAssetLabel(item.asset).concat(" / ", label);
						}

						return label;
					};

					/**
					 * Handle when a subitem is clicked
					 *
					 * @param  {Number} index Subitem index
					 * @return {Void}
					 */
					$scope.subItemClicked = function( index ) {

						// Set active subitem
						if ($scope.activeItem && $scope.activeItem.items) {
							$scope.activeSubItem = $scope.activeItem.items[index];
							$scope.activeSubItemIx = index;
						} else {
							$scope.activeSubItem = null;
							$scope.activeSubItemIx = 0;
						}
					};

					/**
					 * Generic importer for the selected item
					 *
					 * @param  {Object} item Item data
					 * @return {Promise} Item was imported
					 */
					$scope.importItem = function( item ) {
						return importSingleItem(item, function() {
							if (importers.hasOwnProperty(item.type)) {
								return importers[item.type].add(item.properties, {
									appId: appData.id,
									sheetsMaxRank: currAppObjects.sheet.reduce( function( a, b ) { return Math.max(a, b.properties.rank); }, 0)
								});
							} else {
								return $q.reject("No importer found for item of type '".concat(item.type, "'"));
							}
						});
					};

					/**
					 * Generic updater for the selected item
					 *
					 * @param  {Object} item Item data
					 * @return {Promise} Item was Updated
					 */
					$scope.updateItem = function( item ) {
						return updateSingleItem(item, function() {
							if (importers.hasOwnProperty(item.type)) {
								return importers[item.type].update(item.properties, {
									appId: appData.id,
									targetId: item.updatableTargetId || false
								});
							} else {
								return $q.reject("No updater found for item of type '".concat(item.type, "'"));
							}
						});
					};

					/**
					 * Generic importer for all items in the selected asset
					 *
					 * @return {Promise} Items are imported
					 */
					$scope.importMultipleItems = function() {
						var selectedCount = $scope.getSelectedCount();

						// Bail when already imported
						if ($scope.status.imported) {
							return;
						}

						$scope.status.importing = true;

						return $scope.selected.filter( function( item ) {
							return selectedCount ? item.status.selected : true;
						}).reduce( function( promise, item ) {
							return promise.then($scope.importItem.bind(this, item));
						}, $q.resolve()).then( function() {
							$scope.status.importing = false;
							$scope.status.imported = true;
						}).catch( function( error ) {
							console.error(error);
							$scope.status.importing = false;
							$scope.status.importFailed = true;
						});
					};

					/**
					 * Return the amount of selected items
					 *
					 * @return {Number} Amount of selected items
					 */
					$scope.getSelectedCount = function() {
						return $scope.selected.filter( function( item ) {
							return item.status.selected;
						}).length;
					};

					// Get the requested app's objects
					$q.all({
						script: getScriptInfo(app),
						sheet: getSheetInfo(app),
						dimension: getDimensionInfo(app),
						measure: getMeasureInfo(app),
						masterObject: getMasterObjectInfo(app),
						"alternate-state": getAlternateStateInfo(app),
						variable: getVariableInfo(app)
					}).then( function( args ) {
						var i;

						// Prepare items
						for (i in args) {
							if (Array.isArray(args[i])) {
								$scope.allItems[i] = args[i].map(prepareItem);
							}
						}

						// Set default opener to sheets
						$scope.selected = $scope.allItems.sheet;
						$scope.activeItem = $scope.allItems.sheet.length && $scope.allItems.sheet[0];

						// Notify loading is done
						$scope.loading = false;

						// Setup watcher for search. This is defined AFTER allItems are retreived, so that
						// the watcher on initial trigger will apply correctly.
						$scope.$watch("search.query", function( query ) {
							var i;

							for (i in $scope.allItems) {
								if ($scope.allItems.hasOwnProperty(i)) {
									$scope.filteredItems[i] = $scope.allItems[i].filter( function( a ) {
										return (! query.length)
											|| matchSearchQuery(a.id) // Search by id
											|| matchSearchQuery(a.label) // Search by label
											|| matchSearchQuery(a.searchTerms); // Search by pre-defined terms
									});
								}
							}

							// Update selected list
							$scope.assetClicked($scope.activeAsset);

							// Update view to reflect search results
							qvangular.$apply($scope);
						});

					}).catch( function( error ) {
						console.error(error);

						qvangular.getService("qvConfirmDialog").show({
							title: "Importer error",
							message: "Inspect the browser's console for any relevant error data.",
							hideCancelButton: true
						});
					});

					// Provide modal close method to the template
					$scope.close = function() {
						modal.close();
					};

					// Act when the select-all toggle is updated
					$scope.$watch("status.selected", function( newValue, oldValue ) {

						// On change, (de)select all
						if (newValue !== oldValue) {
							$scope.status.imported = false;
							$scope.allItems[$scope.activeAsset].forEach( function( item ) {
								item.status.selected = !! newValue;
							});
						}
					});
				}],
				template: modalTmpl,
				input: {
					title: "Import objects from ".concat(appData.label),
					hideCancelButton: true,
					hideOkButton: false
				},
				variant: false,
				closeOnEscape: true
			});

			// Close the FSM when closing the modal
			modal.closed.then( function() {
				fsm.close();
				modal = null;
			});
		},

		/**
		 * Close the app object importer modal
		 *
		 * @return {Void}
		 */
		closeAppObjectImporterForApp = function() {
			if (modal) {
				modal.close();
				modal = null;
			}
		};

		/**
		 * Check whether the user has access to the Edit mode
		 *
		 * @type {Boolean}
		 */
		$scope.canSwitchToEdit = qlik.navigation.isModeAllowed(qlik.navigation.EDIT);

		/**
		 * Switch to the Edit mode
		 *
		 * @return {Void}
		 */
		$scope.switchToEdit = function() {
			if ($scope.canSwitchToEdit) {
				qlik.navigation.setMode(qlik.navigation.EDIT);

				// Open the app popover after the mode is fully switched
				qvangular.$rootScope.$$postDigest($scope.open);
			}
		};

		/**
		 * Button select handler
		 *
		 * @return {Void}
		 */
		$scope.open = function() {
			if ($scope.object.inEditState()) {
				popover.isActive() ? popover.close() : popover.open();
			}
		};

		// Map popover.isActive() to scope
		$scope.isActive = popover.isActive;

		// Close popover on window resize
		Resize.on("start", popover.close);

		/**
		 * Clean up when the controller is destroyed
		 *
		 * @return {Void}
		 */
		$scope.$on("$destroy", function() {
			Resize.off("start", popover.close);
			popover.close();
			closeAppObjectImporterForApp();
		});
	}];

	return {
		definition: props,
		initialProperties: initProps,
		template: tmpl,
		controller: controller,
		support: {
			snapshot: false,
			export: false,
			exportData: false
		}
	};
});
