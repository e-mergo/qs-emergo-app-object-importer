/**
 * E-mergo App Object Importer Extension
 *
 * @since 20190920
 * @author Laurens Offereins <https://github.com/lmoffereins>
 *
 * @param  {Object} qlik                Qlik's core API
 * @param  {Object} qvangular           Qlik's Angular implementation
 * @param  {Object} underscore          Underscore
 * @param  {Object} $q                  Angular's Q promise library
 * @param  {Object} translator          Qlik's translation API
 * @param  {Object} util                Qlik's utility library
 * @param  {Object} Resize              Qlik's resize API
 * @param  {Object} props               Property panel definition
 * @param  {Object} initProps           Initial properties
 * @param  {Object} util                E-mergo utility functions
 * @param  {String} css                 Extension stylesheet
 * @param  {String} tmpl                Extension template file
 * @param  {String} modalTmpl           Extension modal template file
 * @param  {Void}                       Extension directives
 * @return {Object}                     Extension structure
 */
define([
	"qlik",
	"qvangular",
	"underscore",
	"ng!$q",
	"translator",
	"util",
	"core.utils/resize",
	"./properties",
	"./initial-properties",
	"./util/util",
	"./util/ui-util",
	"text!./style.css",
	"text!./template.ng.html",
	"text!./modal.ng.html",
	"./directives/directives"
], function( qlik, qvangular, _, $q, translator, qUtil, Resize, props, initProps, util, uiUtil, css, tmpl, modalTmpl ) {

	// Add global styles to the page
	util.registerStyle("qs-emergo-app-object-importer", css);

	/**
	 * Holds the objects of the current app
	 *
	 * @type {Object}
	 */
	var currAppObjects = {
		load: function() {
			var app = qlik.currApp();

			return $q.all({
				sheets: getSheetInfo(app),
				dimensions: getDimensionInfo(app),
				measures: getMeasureInfo(app),
				masterObjects: getMasterObjectInfo(app),
				alternateStates: getAlternateStateInfo(app),
				variables: getVariableInfo(app),
				bookmarks: getBookmarkInfo(app)
			}).then( function( args ) {
				currAppObjects.sheet = args.sheets;
				currAppObjects.dimension = args.dimensions;
				currAppObjects.measure = args.measures;
				currAppObjects.masterobject = args.masterObjects;
				currAppObjects["alternate-state"] = args.alternateStates;
				currAppObjects.variable = args.variables;
				currAppObjects.bookmark = args.bookmarks;
			}).catch(console.error);
		}
	},

	/**
	 * Get the app's sheet information
	 *
	 * @param  {Object}  app     The app's API
	 * @param  {Object}  options Optional. Whether to load sheet objects. Defaults to True.
	 * @return {Promise}         List of app sheets
	 */
	getSheetInfo = function( app, options ) {

		// Define default options
		options = qUtil.extend(options || {}, {
			loadWithObjects: true
		});

		return app.getList("sheet").then( function( sessionObject ) {

			// Remove updates for this session object before going forward
			return sessionObject.close().then( function() {
				var sheets = {}, sheetObjects = {};

				// Get details of each sheet's objects
				sessionObject.layout.qAppObjectList.qItems.forEach( function( a ) {

					// Get sheet details
					sheets[a.qInfo.qId] = app.getObjectProperties(a.qInfo.qId);

					// Get sheet objects details
					options.loadWithObjects && a.qData.cells.forEach( function( b ) {
						sheetObjects[b.name] = app.getObjectProperties(b.name).then( function( c ) {

							// Fetch property tree to load list of children on the object.
							// This is mostly relevant for listboxes on a filterpane.
							if (c.properties.hasOwnProperty("qChildListDef")) {
								return app.getFullPropertyTree(c.id).then( function() {
									return c;
								});
							} else {
								return c;
							}
						});
					});
				});

				// Get all objects of all sheets
				return $q.all(qUtil.extend({}, sheets, sheetObjects)).then( function( args ) {

					// Walk list items
					return _.sortBy(_.keys(sheets).map( function( sheetId, index ) {
						var sheet = args[sheetId].properties,

						// Collect sheet objects
						objects = sheet.cells.map( function( b ) {
							return {
								cell: b,
								children: args[b.name].hasOwnProperty("propertyTree") ? args[b.name].propertyTree.qChildren : undefined,
								properties: args[b.name].properties
							};
						}),

						// Create definition from identified objects
						definition = "Contains " + objects.length + " objects (" + objects.map( function( b ) {
							return b.properties.visualization;
						}).join(", ") + ")";

						// Add object data to list
						return {
							label: sheet.qMetaDef.title,
							details: {
								description: sheet.qMetaDef.description,
								definition: definition,
								grid: sheet.gridResolution,
								extended: sheet.layoutOptions ? sheet.layoutOptions.extendable : undefined
							},
							objects: objects,
							rank: sheet.rank || index,
							qData: sheet
						};
					}), "rank");
				});
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
		var dfd = $q.defer(),
		    list = [];

		// Get shallow dimension list
		app.getList("DimensionList").then( function( sessionObject ) {

			// Remove updates for this session object before going forward
			sessionObject.close().then( function() {

				// Walk list items
				sessionObject.layout.qDimensionList.qItems.reduce( function( promise, a ) {

					// Get full dimension info
					return promise.then( function() {
						return app.model.engineApp.getDimension({
							qId: a.qInfo.qId
						}).then( function( resp ) {
							return resp.getLayout().then( function( obj ) {

								// Add object data to list
								list.push({
									label: obj.qMeta.title,
									details: {
										definition: obj.qDim.qFieldDefs.join(" \\ "),
										description: obj.qMeta.description,
										tags: (obj.qMeta.tags || []).join(", ")
									},
									qData: obj
								});
							});
						});
					});
				}, $q.resolve()).then( function() {

					// Return the full list sorted
					dfd.resolve(_.sortBy(list, "label"));
				});
			});
		});

		return dfd.promise;
	},

	/**
	 * Get the app's measure information
	 *
	 * @param  {Object} app The app's API
	 * @return {Promise}    List of app measures
	 */
	getMeasureInfo = function( app ) {
		var dfd = $q.defer(),
		    list = [];

		// Get shallow measure list
		app.getList("MeasureList").then( function( sessionObject ) {

			// Remove updates for this session object before going forward
			sessionObject.close().then( function() {

				// Walk list items
				sessionObject.layout.qMeasureList.qItems.reduce( function( promise, a ) {

					// Get full dimension info
					return promise.then( function() {
						return app.model.engineApp.getMeasure({
							qId: a.qInfo.qId
						}).then( function( resp ) {
							return resp.getLayout().then( function( obj ) {

								// Add object data to list
								list.push({
									label: obj.qMeta.title,
									details: {
										definition: obj.qMeasure.qDef,
										description: obj.qMeta.description,
										tags: (obj.qMeta.tags || []).join(", ")
									},
									qData: obj
								});
							});
						});
					});
				}, $q.resolve()).then( function() {

					// Return the full list sorted
					dfd.resolve(_.sortBy(list, "label"));
				});
			});
		});

		return dfd.promise;
	},

	/**
	 * Get the app's visualization (master object) information
	 *
	 * @param  {Object} app The app's API
	 * @return {Promise}    List of app masterObjects (master objects)
	 */
	getMasterObjectInfo = function( app ) {
		var dfd = $q.defer(),
		    list = [];

		// Wait for the app to open
		app.model.waitForOpen.promise.then( function( model ) {

			// Get master objects list
			model.enigmaModel.getMasterObjectList().then( function( masterObjectList ) {

				// Walk list items
				masterObjectList.reduce( function( promise, a ) {

					// Get full object info
					return promise.then( function() {
						return app.model.engineApp.getObject({
							qId: a.qInfo.qId
						}).then( function( resp ) {
							return resp.getProperties().then( function( props ) {

								// Add object data to list
								list.push({
									label: a.qMeta.title,
									details: {
										visualization: a.qData.visualization,
										description: a.qMeta.description,
										tags: (a.qMeta.tags || []).join(", ")
									},
									properties: props,
									qData: a
								});
							});
						});
					});
				}, $q.resolve()).then( function() {

					// Return the full list sorted
					dfd.resolve(_.sortBy(list, "label"));
				});
			});
		});

		return dfd.promise;
	},

	/**
	 * Get the app's alternate states information
	 *
	 * @param  {Object} app The app's API
	 * @return {Promise}    List of app alternate states
	 */
	getAlternateStateInfo = function( app ) {

		// Wait for the app to open
		return app.model.waitForOpen.promise.then( function( model ) {

			// Wait for the app's layout to load
			return model.ongoingRequests.GetLayout.then( function( layout ) {

				// Get alternate states from the app's layout
				return _.sortBy(layout.qStateNames.map( function( a ) {
					return {
						label: a,
						qData: {
							title: a,
							qInfo: {
								qId: a,
								qType: "alternate-state"
							}
						}
					};
				}), "label");
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
		return app.getList("VariableList").then( function( sessionObject ) {

			// Remove updates for this session object before going forward
			return sessionObject.close().then( function() {

				// Walk list items
				return _.sortBy(sessionObject.layout.qVariableList.qItems.map( function( a ) {

					// Add object data to list
					return {
						label: a.qName,
						details: {
							definition: a.qDefinition,
							description: a.qDescription,
							tags: (a.qData.tags || []).join(", ")
						},
						qData: a
					};
				}), "label");
			});
		});
	},

	/**
	 * Get the app's bookmarks information
	 *
	 * @param  {Object} app The app's API
	 * @return {Promise}    List of app bookmarks
	 */
	getBookmarkInfo = function( app ) {
		return app.getList("BookmarkList").then( function( sessionObject ) {

			// Remove updates for this session object before going forward.
			// Also, load the app's alternate states
			// Also, load the current app's field list
			return $q.all({
				close: sessionObject.close(),
				states: getAlternateStateInfo(app),
				fieldList: getFieldNames(qlik.currApp())
			}).then( function( args ) {
				var bookmarkObjectsPromise = {};

				// Get set analysis definition of each bookmark
				sessionObject.layout.qBookmarkList.qItems.forEach( function( a ) {

					// Walk each alternate state, including the default state
					["$"].concat(_.pluck(args.states, "label")).forEach( function( state ) {

						// Get the state's selection value for the bookmark
						bookmarkObjectsPromise[a.qInfo.qId + "/" + state] = app.model.engineApp.getSetAnalysis(state, a.qInfo.qId);
					});
				});

				// Get all data of all bookmarks
				return $q.all(bookmarkObjectsPromise).then( function( bookmarks ) {

					// Walk list items
					return _.sortBy(sessionObject.layout.qBookmarkList.qItems.map( function( a ) {
						var definition = [], bookmarkHasUnknownFields = false, i, j;
						a.setAnalysis = {};

						// Get set analysis expressions of the bookmark
						for (i in bookmarks) {
							j = i.split("/");
							if (j[0] === a.qInfo.qId && bookmarks[i].qSetExpression.length) {
								a.setAnalysis[j[1]] = bookmarks[i].qSetExpression;

								// Setup human readable format
								definition.push(("$" === j[1] ? "<default-state>" : j[1]) + ": " + bookmarks[i].qSetExpression);
							}
						}

						// List fields that are part of the selections
						a.selectionFields = _.uniq(_.flatten(a.qData.qBookmark.qStateData.map( function( b ) {
							return b.qFieldItems.map( function( c ) {
								var fieldName = c.qDef.qName;

								// Mark fields that are not in the current app's field list
								if (-1 === args.fieldList.indexOf(c.qDef.qName)) {
									bookmarkHasUnknownFields = true;
									fieldName += "*";
								}

								return fieldName;
							});
						}))).join(", ");

						// Add object data to list
						return {
							label: a.qMeta.title + (bookmarkHasUnknownFields ? "*" : ""),
							details: {
								definition: definition.join(", "),
								description: a.qMeta.description,
								states: _.keys(a.setAnalysis).map( function( b ) {
									return "$" === b ? "<default-state>" : b;
								}).join(", "),
								fields: a.selectionFields
							},
							qData: a
						};
					}), "label");
				});
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
		var regex = new RegExp('(<|,)' + fieldName + '={([^}]+)(}>|},)'),
		    matches = set.match(regex);

		// Get array from string list
		return matches[2].split(",").map( function( a ) {

			// Remove surrounding single quotes
			return a.replace(/^'(.*)'$/, "$1");
		});
	},

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
					showAppObjectImporterForApp(app);
				}
			}
		}),

		/**
		 * Holds the loaded apps
		 *
		 * This is loaded once when calling `qlik.getGlobal().getAppList()` to
		 * prevent max listener errors on the related event emitter.
		 *
		 * @type {Array}
		 */
		appList,

		/**
		 * Define the app popover
		 *
		 * @return {Object} Popover methods
		 */
		popover = uiUtil.uiSearchableListPopover({
			title: "Apps",
			get: function( setItems ) {
				if ("undefined" === typeof appList) {
					qlik.getGlobal().getAppList( function( items ) {
						appList = items.map( function( a ) {
							return {
								value: a.qTitle,
								label: a.qTitle,
								id: a.qDocId
							};
						});

						setItems(appList);
					});
				} else {
					setItems(appList);
				}
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
		 * Holds the modal for the app object importer
		 *
		 * @type {Object}
		 */
		modal,

		/**
		 * Open the object app importer modal for the selected app
		 *
		 * @param  {Object} appData Selected app
		 * @return {Void}
		 */
		showAppObjectImporterForApp = function( appData ) {

			/**
			 * Return whether the item already exists in the current app
			 *
			 * @param  {Object} item Object item
			 * @return {Boolean} Item exists
			 */
			function checkItemExists( item ) {
				var exists = false;

				if (item.qData.qInfo.qType && currAppObjects[item.qData.qInfo.qType]) {
					switch (item.qData.qInfo.qType) {
						case "sheet":
							exists = _.some(currAppObjects.sheet, function( a ) {
								return a.qData.title === item.qData.title && a.qData.qInfo.qId === item.qData.qInfo.qId;
							});
							break;

						case "dimension":
							exists = _.some(currAppObjects.dimension, function( a ) {
								return a.qData.title === item.qData.title && JSON.stringify(a.qData.qDim.qFieldDefs) === JSON.stringify(item.qData.qDim.qFieldDefs);
							});
							break;

						case "measure":
							exists = _.some(currAppObjects.measure, function( a ) {
								return a.qData.qMeasure.qLabel === item.qData.qMeasure.qLabel && a.qData.qMeasure.qDef === item.qData.qMeasure.qDef;
							});
							break;

						case "masterobject":
							exists = _.some(currAppObjects.masterobject, function( a ) {
								return a.qData.qMeta.title === item.qData.qMeta.title && a.qData.qInfo.qId === item.qData.qInfo.qId;
							});
							break;

						case "alternate-state":
							exists = _.some(currAppObjects[item.qData.qInfo.qType], function( a ) {
								return a.qData.title === item.qData.title;
							});
							break;

						case "variable":
							exists = _.some(currAppObjects.variable, function( a ) {
								return a.qData.qName === item.qData.qName && a.qData.qDefinition === item.qData.qDefinition;
							});
							break;

						case "bookmark":
							exists = _.some(currAppObjects.bookmark, function( a ) {
								return a.qData.qMeta.title === item.qData.qMeta.title && JSON.stringify(a.qData.setAnalysis) === JSON.stringify(item.qData.setAnalysis);
							});
							break;
					}
				}

				return exists;
			}

			/**
			 * Define additional parameters on an item
			 *
			 * @param  {Object} item Object item
			 * @return {Object} Item
			 */
			function prepareItem( item ) {
				var details = [], i;

				// Define status parameters
				item.toggled = false;
				item.adding = false;
				item.added = false;
				item.failed = false;
				item.disabled = false;
				item.exists = checkItemExists(item);

				// Transform details to objects of name/label/value
				for (i in item.details || {}) {
					if (item.details.hasOwnProperty(i) && item.details[i] && item.details[i].length) {
						details.push({
							name: i,
							label: item.details[i].label || (i[0].toUpperCase() + i.substr(1)),
							value: item.details[i].value || item.details[i]
						});
					}
				}

				// Overwrite previously defined details to make it an array
				item.details = details;

				return item;
			}

			// Wait for the current app objects to be loaded
			currAppObjects.load().then( function() {
				// console.log("AppObjectImporter: current app objects", currAppObjects);

				// Open the modal
				modal = qvangular.getService("luiDialog").show({
					controller: ["$scope", function( $scope ) {
						var dfd = $q.defer(),

						// Connect with the provided app
						app = qlik.openApp(appData.id, { openWithoutData: true });

						// Setup scope labels and flags
						$scope.okLabel = $scope.input.okLabel || translator.get( "Common.Done" );
						$scope.cancelLabel = $scope.input.cancelLabel || translator.get( "Common.Cancel" );
						$scope.loading = true;
						$scope.nothingFound = true;
						$scope.show = {
							sheets: true,
							dimensions: false,
							measures: false,
							masterObjects: false,
							alternateStates: false,
							variables: false,
							bookmarks: false
						};

						// Settings for import
						$scope.settings = {
							sheetsImportAlternateStates: false, // TODO: Relevant?
							bookmarksImportAlternateStates: true
						};

						$scope.toggle = function( event, item ) {
							if (event && !$(event.target).is(".add-button, .add-button-text, .lui-button")) {
								if ("string" === typeof item && $scope.show.hasOwnProperty(item)) {
									$scope.show[item] = ! $scope.show[item];
								} else {
									item.toggled = ! item.toggled;
								}
							}
						};

						/**
						 * Import a sheet from the selected item
						 *
						 * @param {Object} item Item data
						 * @return {Promise} Item was added
						 */
						$scope.addSheet = function( item ) {
							return addItem(item, function() {
								var importAlternateStates;

								// When requested, import relevant alternate states first
								if ($scope.settings.sheetsImportAlternateStates) {
									var addStateItems = {}, getAlternateStateItem = function( a ) {
										return $scope.alternateStates.find( function( b ) {
											return a === b.qData.title;
										});
									}, i;

									for (i in item.qData.setAnalysis) {
										if (item.qData.setAnalysis.hasOwnProperty(i) && "$" !== i) {
											addStateItems[i] = $scope.addAlternateState(getAlternateStateItem(i));
										}
									}

									importAlternateStates = $q.all(addStateItems);
								} else {
									importAlternateStates = $q.resolve();
								}

								return importAlternateStates.then( function() {
									var data = qUtil.extend({
										qMetaDef: item.qData.qMeta
									}, item.qData.qData, item.qData);

									// Put sheet in the last position
									data.rank = currAppObjects.sheet.length;

									// Remove published metadata
									removePublishMetaData(data);

									// Sheet ids are not created equal
									delete data.qInfo.qId;

									// Create the sheet with base data
									return qlik.currApp().model.engineApp.createObject(data).then( function( createdObject ) {

										// Request the sheet's property tree
										return createdObject.qInfo.getFullPropertyTree().then( function( tree ) {

											// Setup sheet children for visualization data
											tree.qChildren = item.objects.map( function( a ) {
												return {
													qChildren: a.children,
													qProperty: a.properties
												};
											});

											// Save new sheet property tree
											return createdObject.qInfo.setFullPropertyTree(tree);
										});
									});
								});
							});
						};

						/**
						 * Import a dimension (master item) from the selected item
						 *
						 * @param {Object} item Item data
						 * @return {Promise} Item was added
						 */
						$scope.addDimension = function( item ) {
							return addItem(item, function() {
								var data = qUtil.extend({
									qMetaDef: item.qData.qMeta
								}, item.qData);

								// Remove published metadata
								removePublishMetaData(data);

								return qlik.currApp().model.engineApp.createDimension(data);
							});
						};

						/**
						 * Import a measure (master item) from the selected item
						 *
						 * @param {Object} item Item data
						 * @return {Promise} Item was added
						 */
						$scope.addMeasure = function( item ) {
							return addItem(item, function() {
								var data = qUtil.extend({
									qMetaDef: item.qData.qMeta
								}, item.qData);

								// Remove published metadata
								removePublishMetaData(data);

								return qlik.currApp().model.engineApp.createMeasure(data);
							});
						};

						/**
						 * Import a visualization (master object) from the selected item
						 *
						 * @param {Object} item Item data
						 * @return {Promise} Item was added
						 */
						$scope.addMasterObject = function( item ) {
							return addItem(item, function() {
								var data = qUtil.extend({
									qMetaDef: item.qData.qMeta
								}, item.qData);

								// Remove published metadata
								removePublishMetaData(data);

								// Create the base master object
								return qlik.currApp().model.engineApp.createObject(data).then( function( createdObject ) {

									// Save new object properties
									return createdObject.qInfo.setProperties(item.properties);
								});
							});
						};

						/**
						 * Import an alternate state from the selected item
						 *
						 * @param {Object} item Item data
						 * @return {Promise} Item was added
						 */
						$scope.addAlternateState = function( item ) {
							return addItem(item, function() {
								return qlik.currApp().model.engineApp.addAlternateState(item.qData.title);
							});
						};

						/**
						 * Import a variable from the selected item
						 *
						 * @param {Object} item Item data
						 * @return {Promise} Item was added
						 */
						$scope.addVariable = function( item ) {
							return addItem(item, function() {
								var data = qUtil.extend({
									qComment: item.qData.qDescription,
									tags: item.qData.qData.tags
								}, item.qData);

								// Variable ids are not created equal
								delete data.qInfo.qId;

								return qlik.currApp().model.engineApp.createVariableEx(data);
							});
						};

						/**
						 * Import a bookmark from the selected item
						 *
						 * Allows for importing the bookmark's alternate states prior to creating the
						 * bookmark.
						 *
						 * When creating a bookmark, the current selections are used for the bookmark's
						 * selections; the current sheet is used for the bookmark's location.
						 *
						 * In order to do this, when importing the bookmark, the current selections
						 * need to be replaced (cleared, then set) to the imported bookmark's selections.
						 *
						 * Afterwards, the selections applied for the bookmark are cleared again.
						 *
						 * @TODO: Check whether field exists. Server's Field API does not handle waitFor properly.
						 *
						 * @param {Object} item Item data
						 * @return {Promise} Item was added
						 */
						$scope.addBookmark = function( item ) {
							return addItem(item, function() {
								var importAlternateStatesPromise;

								// When requested, import relevant alternate states first
								if ($scope.settings.bookmarksImportAlternateStates) {
									var addStateItemsPromises = {}, getAlternateStateItem = function( a ) {
										return $scope.alternateStates.find( function( b ) {
											return a === b.qData.title;
										});
									}, i;

									for (i in item.qData.setAnalysis) {
										if (item.qData.setAnalysis.hasOwnProperty(i) && "$" !== i) {
											addStateItemsPromises[i] = $scope.addAlternateState(getAlternateStateItem(i));
										}
									}

									importAlternateStatesPromise = $q.all(addStateItemPromisess);
								} else {
									importAlternateStatesPromise = $q.resolve();
								}

								return importAlternateStatesPromise.then( function() {
									var clearAllPromises = {},
									    app = qlik.currApp();

									// Before applying the bookmark's selections, clear all current
									// selections (locked also), on each of the app's states
									["$"].concat($scope.alternateStates).forEach( function( a ) {
										var state = a.qData ? a.qData.title : a;
										clearAllPromises[state] = app.clearAll(true, state);
									});

									// Get the app's field list
									clearAllPromises.fieldList = getFieldNames(app);

									// Clear all current selections before applying the bookmark's
									return $q.all(clearAllPromises).then( function( args ) {
										var fieldSelections = {};

										// Walk bookmark states
										item.qData.qData.qBookmark.qStateData.forEach( function( a ) {

											// Only use fields that do exist in the app
											a.qFieldItems.filter( function( b ) {
												return -1 !== args.fieldList.indexOf(b.qDef.qName);

											// Walk existing bookmark state fields
											}).forEach( function( b ) {
												var id = b.qDef.qName + "/" + a.qStateName,
												    doingSearch = "undefined" !== typeof b.qSelectInfo.qTextSearch,

												    // Fetch the field's API in the relevant state
												    field = qlik.currApp().field(b.qDef.qName, a.qStateName);

												// When the field exists, apply bookmark state field selection
												fieldSelections[id] = field.waitFor.then( function() {
											    	var matcher = doingSearch ? b.qSelectInfo.qTextSearch : getValuesFromSetAnalysis(item.qData.setAnalysis[a.qStateName], b.qDef.qName);
													return field[doingSearch ? "selectMatch" : "selectValues"](matcher, false).catch(console.error);
												});
											});
										});

										// Define active selections before creating the bookmark
										return $q.all(fieldSelections).then( function() {
											var data = qUtil.extend({
												qMetaDef: item.qData.qMeta,
												sheetId: qlik.navigation.getCurrentSheetId().sheetId
											}, item.qData);

											// Remove published metadata
											removePublishMetaData(data);

											return qlik.currApp().model.engineApp.createBookmark(data);

										// Afterwards remove the selections again
										}).then( function() {
											var clearAll = {};

											// Setup clearAll for each alternate state
											item.qData.qData.qBookmark.qStateData.forEach( function( a ) {
												clearAll[a.qStateName] = qlik.currApp().clearAll(false, a.qStateName);
											});

											return $q.all(clearAll);
										});
									});
								});
							});
						};

						/**
						 * Process an all-items request
						 *
						 * @param {String} type Item type name
						 */
						$scope.addAllItems = function( type ) {
							var typeMap = {
								sheets: $scope.addSheet,
								dimensions: $scope.addDimension,
								measures: $scope.addMeasure,
								masterObjects: $scope.addMasterObject,
								alternateStates: $scope.addAlternateState,
								variables: $scope.addVariable,
								bookmarks: $scope.addBookmark
							};

							if (typeMap[type] && $scope[type].length) {
								$scope[type].reduce( function( promise, a ) {
									return promise.then( function() {
										return typeMap[type](a);
									});
								}, $q.resolve());
							}
						};

						/**
						 * Process an item's addition
						 *
						 * @param {Object}   item Item data
						 * @param {Function} cb   Addition callback. Should return a Promise.
						 * @return {Promise} Item addition was processed
						 */
						var addItem = function( item, cb ) {
							if (! item.added && ! item.failed && ! item.exists) {
								item.adding = true;

								return cb().then( function() {
									item.adding = false;
									item.added = true;
								}).catch( function( error ) {
									console.error(error);

									item.adding = false;
									item.failed = true;
								}).finally( function() {

									// Update view
									qvangular.$apply($scope);
								});
							} else {
								return $q.resolve();
							}
						},

						/**
						 * Remove server publish metadata of the original item
						 *
						 * @param  {Object} data Item data
						 * @return {Void}
						 */
						removePublishMetaData = function( data ) {
							// delete data.qInfo.qId;
							delete data.qMetaDef.createdDate;
							delete data.qMetaDef.modifiedDate;
							delete data.qMetaDef.published;
							delete data.qMetaDef.publishTime;
							delete data.qMetaDef.approved;
							delete data.qMetaDef.owner;
							delete data.qMetaDef.sourceObject;
							delete data.qMetaDef.draftObject;
							delete data.qMetaDef.privileges;
							delete data.qMeta;
						};

						// Get the requested app's objects
						$q.all({
							sheets: getSheetInfo(app),
							dimensions: getDimensionInfo(app),
							measures: getMeasureInfo(app),
							masterObjects: getMasterObjectInfo(app),
							alternateStates: getAlternateStateInfo(app),
							variables: getVariableInfo(app),
							bookmarks: getBookmarkInfo(app),
						}).then( function( args ) {
							// console.log("AppObjectImporter: requested app objects", args);

							// Prepare items, then list 'em
							$scope.sheets          = args.sheets.map(prepareItem);
							$scope.dimensions      = args.dimensions.map(prepareItem);
							$scope.measures        = args.measures.map(prepareItem);
							$scope.masterObjects   = args.masterObjects.map(prepareItem);
							$scope.alternateStates = args.alternateStates.map(prepareItem);
							$scope.variables       = args.variables.map(prepareItem);
							$scope.bookmarks       = args.bookmarks.map(prepareItem);

							// Disconnect or should we?
							// app.close();

							// Define whether anything was found
							$scope.nothingFound = ! _.reject(_.values(args), _.isEmpty).length;

							// Notify loading is done
							$scope.loading = false;
						}).catch(console.error);
					}],
					template: modalTmpl,
					input: {
						title: "Import objects from app '" + appData.label + "'",
						hideCancelButton: true,
						hideOkButton: false,
					},
					variant: false,
					closeOnEscape: true
				});

				// Close the FSM when closing the modal
				modal.closed.then( function() {
					fsm.close();
					modal = null;
				});
			}).catch( function( error ) {
				console.error(error);

				qvangular.getService("qvConfirmDialog").show({
					title: "Importer error",
					message: "Inspect the browser's console for any relevant error data.",
					hideCancelButton: true
				});
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
