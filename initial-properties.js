/**
 * E-mergo App Object Importer Initial Properties
 *
 * @package E-mergo Tools Bundle
 *
 * @param  {String} qext          Extension QEXT data
 * @return {Object}               Initial properties
 */
define([
	"text!./qs-emergo-app-object-importer.qext"
], function( qext ) {
	return {
		showTitles: false,
		title: JSON.parse(qext).name
	};
});
