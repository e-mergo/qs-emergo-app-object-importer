/**
 * E-mergo App Object Importer Custom Directives
 *
 * @package E-mergo Tools Bundle
 */
define([
	"qvangular",
	"text!./notice.ng.html",
	"text!./section-list.ng.html",
	"text!./add-button.ng.html"
], function( qvangular, noticeTmpl, sectionListTmpl, addButtonTmpl ) {

	// Notice
	qvangular.directive("qsEmergoAppObjectImporterNotice", function() {
		return {
			template: noticeTmpl,
			replace: true,
			restrict: "E",
			transclude: true,
			scope: {
				icon: "@"
			},
			compile: function( element, attrs ) {

				// Default to info icon
				if (! attrs.icon) {
					attrs.icon = "info";
				}
			}
		};
	});

	// Section List
	qvangular.directive("qsEmergoAppObjectImporterSectionList", function() {
		return {
			template: sectionListTmpl,
			replace: true,
			restrict: "E",
			scope: {
				items: "=",
				add: "=",
				type: "@"
			},
			controller: ["$scope", function( $scope ) {
				$scope.toggle = function( event, item ) {
					if (event && !$(event.target).is(".add-button, .add-button-text, .lui-button")) {
						if ("string" === typeof item && $scope.show.hasOwnProperty(item)) {
							$scope.show[item] = ! $scope.show[item];
						} else {
							item.toggled = ! item.toggled;
						}
					}
				};
			}]
		};
	});

	// Add button
	qvangular.directive("qsEmergoAppObjectImporterAddButton", function() {
		return {
			template: addButtonTmpl,
			replace: true,
			restrict: "E",
			scope: {
				item: "=",
				add: "=",
				type: "="
			},
			controller: ["$scope", function( $scope ) {
				$scope.canAdd = function( item ) {
					return !item.adding && !item.added && !item.failed && !item.exists;
				};

				$scope.title = function( item ) {
					return $scope.canAdd(item)
						? ("Add this " + $scope.type + " to the current app")
						: item.added
							? ("This " + $scope.type + " is added to the current app")
							: item.failed
								? ("This " + $scope.type + " could not be added to the current app")
								: item.exists
									? ("This " + $scope.type + " already exists in the current app")
									: "";
				};
			}]
		};
	});
});
