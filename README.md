---
Type: Qlik Sense Visualization Extension
Name: E-mergo App Object Importer
Version: 1.3-beta
QEXT: qs-emergo-app-object-importer.qext
---

# E-mergo App Object Importer

**E-mergo App Object Importer** is a Qlik Sense extension developed by [E-mergo](https://www.e-mergo.nl). This extension enables the app designer to import structured objects of a selected app, like master items and variables, into the current app. This tool simplifies the frequent repetitive task of manually copying over such objects.

This extension is part of the [E-mergo Tools bundle](https://www.e-mergo.nl/e-mergo-tools-bundle/?utm_medium=download&utm_source=tools_bundle&utm_campaign=E-mergo_Extension&utm_term=toolsbundle&utm_content=sitelink).

This extension is [hosted on GitHub](https://github.com/e-mergo/qs-emergo-app-object-importer). You can report bugs and discuss features on the [issues page](https://github.com/e-mergo/qs-emergo-app-object-importer/issues).

## Why is this extension needed?
In larger Qlik Sense environments it is not uncommon to be confronted with the desire to share app objects across multiple apps. Scenarios include sharing once-defined master items and variables, re-using sheet layouts, etc. When apps are developed separately, the only way to share app objects is to manually copy them over. This quickly becomes a repetitive and tedious task, even more so when the app objects contain multiple expressions, color definitions, tags and other details.

This extension removes the barriers for importing app objects by offering a one-click import solution for an app's objects. The following types of app objects are supported:
- Sheets
- Dimension master items
- Measure master items
- Visualization master items
- Alternate states
- Variables

## Disclaimer
This extension is created free of charge for Qlik Sense app developers, personal or professional. E-mergo developers aim to maintain the functionality of this extension with each new release of Qlik Sense. However, this product does not ship with any warranty of support. If you require any updates to the extension or would like to request additional features, please inquire for E-mergo's commercial plans for supporting your extension needs at support@e-mergo.nl.

On server installations that do not already have it registered, the Markdown file mime type will be registered when opening the documentation page. This is required for Qlik Sense to be able to successfully return `.md` files when those are requested from the Qlik Sense web server. Note that registering the file mime type is only required once and is usually only allowed for accounts with RootAdmin level permissions.

## Features
Below is a detailed description of the available features of this extension.

### Select App
To start importing app objects first select the app origin. The app selector popover enables searching based on app name.

### Import and Update App Objects
After selecting an app in the popup the importer displays all available app objects that exist in the selected app. App objects are grouped by type, providing detailed information and an *Import object* button per object. For each object type an *Import all ...* button is available to instantly import the full set of app objects of that type. When individual app objects are selected with their checkboxes, the *Import selected* button will only import those selected items. If a single app object already exists in the app, an *Update object* button is available per object.

#### Script
Import script sections from the selected app. Selecting a script section name displays the content of the script section. Importing the script section adds the section to the end of the app's script. Note that script sections are only importable from apps for which the current user has edit privileges.

#### Sheets
Import sheets from the selected app. Selecting a sheet name displays a summary of its contents and a description, when available. Importing the sheet includes all visualizations on the sheet and their registered properties.

#### Dimensions
Import dimension master items from the selected app. Selecting a dimension name displays the associated definition, description and tags, when available. Importing the master item includes all displayed properties and other properties that are defined on the app object like colors.

#### Measures
Import measure master items from the selected app. Selecting a measure name displays the associated definition, description and tags, when available. Importing the master item includes all displayed properties and other properties that are defined on the app object like colors.

#### Visualizations (master objects)
Import visualization master items from the selected app. Selecting a visualization name displays the associated visualization type, description and tags, when available. Importing the master item includes all displayed properties and other properties that are defined on the app object.

#### Alternate states
Import alternate states from the selected app. Since no other properties are defined on an alternate state, importing the app object only includes creating an alternate state with the given name.

#### Variables
Import regular variables from the selected app. Variables created in an app's script can be imported. However, these types of variable will not be imported as script-variables, but only as regular app variables. Selecting a variable name displays the associated definition, descriptio, and tags, when available. Importing the variable includes all displayed properties.

### Duplicating objects
There is no mechanism in place to prevent creating duplicate app objects. A visual indicator is shown for app objects that already exist in the current app. This check is mostly done based on the object's name or title. As a consequence this means that existing app objects still can be imported, however not alternate states and variables which must have a unique name. Because these app objects are importable, the existing app objects may also be duplicated by the *Import selected* button.

## FAQ

### Can I get support for this extension?
E-mergo provides paid support through standard support contracts. For other scenarios, you can post your bugs or questions in the extension's GitHub repository.

### Can you add feature X?
Requests for additional features can be posted in the extension's GitHub repository. Depending on your own code samples and the availability of E-mergo developers your request may be considered and included.

### What about importing bookmarks?
Importing bookmarks was previously part of earlier versions of this extension. However, since the rewrite of import functions in version 1.3 it was found that no reliable result could be created for importing bookmarks. The wide variety of bookmark properties are currently not easily and correctlly replicated in a different app using the available Qlik Sense API's. Untill a proper way for importing (and updating) bookmarks is found, this functionality is not part of this extension.

## Changelog

#### 1.3-beta - QS November 2022
- Ready for Qlik Cloud.
- Renamed extension label to improve discoverability in the extensions list.
- Added import of script sections.
- Added import (duplication) of existing app objects.
- Added the updating of existing app objects.
- Fixed a bug where an app object's layout was imported instead of its properties.
- Updated layout of the app object modal to improve discoverability of app objects and to provide more object details.
- Updated docs files.
- Removed import of bookmarks.

#### 1.2.20200918 - QS September 2022
- Fixed the layout for smaller extension object sizes.

#### 1.1.20200731
- Fixed logic for the _Open Documentation_ button.

#### 1.0.20200623
- Updated docs files.

#### 1.0.20200622
- Fixed internal naming and updated docs.

#### 0.3.20200529
- Fixed import of sheet metadata.
- Fixed import of filterpanes.
- Fixed a potential memory leak when loading the app list multiple times.

#### 0.2.20200227
- Added markings when importing bookmarks with missing fields.
- Fixed import of published app objects that were uneditable.

#### 0.1.20191015
Initial release.
