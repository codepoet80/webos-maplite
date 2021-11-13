/*
    Podcast Directory app for webOS.
    This app depends on a Retro Podcast service, which is by webOS Archive at no cost for what remains of the webOS mobile community.
*/

function MainAssistant() {
    /* this is the creator function for your scene assistant object. It will be passed all the 
       additional parameters (after the scene name) that were passed to pushScene. The reference
       to the scene controller (this.controller) has not be established yet, so any initialization
       that needs the scene controller should be done in the setup function below. */
    this.zoomLevel = 9;
    this.orientation = "unknown";
    this.mapData = null;
}

MainAssistant.prototype.setup = function() {

    //Controls Drawer
    this.controller.setupWidget("drawerControls",
        this.attributes = {
            modelProperty: 'open',
            unstyled: false
        },
        this.model = {
            open: true
        }
    ); 
    //Search bar
    this.controller.setupWidget('txtSearch',
        this.attributes = {
            hintText: 'Enter and address or coordinates...',
            multiline: false,
            autoFocus: true,
            focusMode: Mojo.Widget.focusSelectMode
        },
        this.model = {
            value: '',
            disabled: false
        }
    );
    //Search button - with global members for easy toggling later
    this.submitBtnAttrs = {};
    this.submitBtnModel = {
        label: "Search",
        disabled: false
    };
    this.controller.setupWidget("btnGet", this.submitBtnAttrs, this.submitBtnModel);
    //Loading spinner - with global members for easy toggling later
    /*
    this.spinnerAttrs = {
        spinnerSize: Mojo.Widget.spinnerLarge
    };
    this.spinnerModel = {
        spinning: false
    }
    this.controller.setupWidget('workingSpinner', this.spinnerAttrs, this.spinnerModel);
    */
    //Map Scroller
    this.controller.setupWidget("divShowResultImage",
        this.attributes = {
            mode: 'free'
        },
        this.model = { }
    );
    //Menu
    this.appMenuAttributes = { omitDefaultItems: true };
    this.appMenuModel = {
        label: "Settings",
        items: [
            Mojo.Menu.editItem,
            { label: "Preferences", command: 'do-Preferences' },
            { label: "About", command: 'do-myAbout' }
        ]
    };
    this.controller.setupWidget(Mojo.Menu.appMenu, this.appMenuAttributes, this.appMenuModel);
    // Setup command buttons (menu)
    this.cmdMenuAttributes = {
        menuClass: 'no-fade'
    }
    this.cmdMenuModel = {
        visible: true,
        items: [{
                items: [
                    { label: 'Z-', command: 'do-zoomOut' },
                    { label: 'Z+', command: 'do-zoomIn' },
                ]
            },
            {
                items: []
            }
        ]
    };
    this.controller.setupWidget(Mojo.Menu.commandMenu, this.cmdMenuAttributes, this.cmdMenuModel);

    /* Always on Event handlers */
    Mojo.Event.listen(this.controller.get("btnGet"), Mojo.Event.tap, this.handleSearchClick.bind(this));
    // Non-Mojo widgets
    Mojo.Event.listen(this.controller.get("divTitle"), Mojo.Event.tap, this.handleTitleTap.bind(this));
    $("btnClear").addEventListener("click", this.handleClearTap.bind(this));
    $("imgMap").addEventListener("click", this.handleMapTap.bind(this));
    this.keyupHandler = this.handleKeyUp.bindAsEventListener(this);
    this.controller.document.addEventListener("keyup", this.keyupHandler, true);

    //Check for updates
    if (!appModel.UpdateCheckDone) {
        appModel.UpdateCheckDone = true;
        updaterModel.CheckForUpdate("Retro Maps", this.handleUpdateResponse.bind(this));
    }
};

MainAssistant.prototype.handleUpdateResponse = function(responseObj) {
    if (responseObj && responseObj.updateFound) {
        updaterModel.PromptUserForUpdate(function(response) {
            if (response)
                updaterModel.InstallUpdate();
        }.bind(this));
    }
}

MainAssistant.prototype.activate = function(event) {
    //Load preferences
    appModel.LoadSettings();
    Mojo.Log.info("settings now: " + JSON.stringify(appModel.AppSettingsCurrent));
    this.zoomLevel = appModel.AppSettingsCurrent["DefaultZoom"];
    serviceModel.UseCustomEndpoint = appModel.AppSettingsCurrent["UseCustomEndpoint"];
    serviceModel.CustomEndpointURL = appModel.AppSettingsCurrent["EndpointURL"];
    if (appModel.AppSettingsCurrent["FirstRun"]) {
        appModel.AppSettingsCurrent["FirstRun"] = false;
        appModel.SaveSettings();
        Mojo.Additions.ShowDialogBox("Welcome to Retro Maps!", "This is a client for a Retro Maps web service, which is powered by Bing Maps and IPInfo.io. You can use the community server for free, until its API limits are hit, or you can enhance your privacy and ease the load by hosting the service yourself.");
    }

    this.orientation = this.determineOrientation();
    //find out what kind of device this is
    if (Mojo.Environment.DeviceInfo.platformVersionMajor >= 3) {
        this.DeviceType = "TouchPad";
        Mojo.Log.info("Device detected as TouchPad");
    } else {
        if (window.screen.width == 800 || window.screen.height == 800) {
            this.DeviceType = "Pre3";
            Mojo.Log.info("Device detected as Pre3");
        } else if ((window.screen.width == 480 || window.screen.height == 480) && (window.screen.width == 320 || window.screen.height == 320)) {
            this.DeviceType = "Pre";
            Mojo.Log.warn("Device detected as Pre or Pre2");
        } else {
            this.DeviceType = "Tiny";
            Mojo.Log.warn("Device detected as Pixi or Veer");
        }
    }
    //handle launch with search query
    if (appModel.LaunchQuery != "") {
        Mojo.Log.info("using launch query: " + appModel.LaunchQuery);
        $("txtSearch").mojo.setValue(appModel.LaunchQuery);
        this.handleSearchClick();
    } else {
        if (appModel.LastSearchString) {
            $("txtSearch").mojo.setValue(appModel.LastSearchString);
            this.handleSearchClick();
        } else {
            this.getLocationFix();
        }
    }
    //Get ready for input!
    this.controller.window.onresize = this.calculateControlsPosition.bind(this);

};

/* UI Events */

//Handle menu and button bar commands
MainAssistant.prototype.handleCommand = function(event) {
    if (event.type == Mojo.Event.command) {
        switch (event.command) {
            case 'do-zoomOut':
                this.changeZoom(false)
                break;
            case 'do-zoomIn':
                this.changeZoom(true)
                break;
            case 'do-Preferences':
                var stageController = Mojo.Controller.stageController;
                stageController.pushScene({ name: "preferences", disableSceneScroller: false });
                break;
            case 'do-myAbout':
                Mojo.Additions.ShowDialogBox("Retro Maps - " + Mojo.Controller.appInfo.version, "Retro Maps client for webOS. Copyright 2021, Jon Wise. Distributed under an MIT License, and powered by Bing Maps and IPInfo.io.<br>Source code available at: https://github.com/codepoet80/webos-retromaps");
                break;
        }
    }
};

//Handles the enter key
MainAssistant.prototype.handleKeyUp = function(event) {

    if (event && Mojo.Char.isEnterKey(event.keyCode)) {
        if (event.srcElement.parentElement.id == "txtSearch") {
            this.handleClick(event);
        }
    }
};

//Handle mojo button taps
MainAssistant.prototype.handleSearchClick = function(event) {

    this.disableUI();

    //figure out what was requested
    var stageController = Mojo.Controller.getAppController().getActiveStageController();
    if (stageController) {
        this.controller = stageController.activeScene();
        var searchRequest = $("txtSearch").mojo.getValue();
        if (searchRequest && searchRequest != "") {
            appModel.LastSearchString = searchRequest;
            this.searchMapData(searchRequest);
        } else {
            this.enableUI();
            setTimeout("$('txtSearch').mojo.focus();", 100);
        }
    }
}

//Handle tap of title bar
MainAssistant.prototype.handleTitleTap = function() {
    $("drawerControls").mojo.toggleState();
    this.controller.window.setTimeout(this.calculateControlsPosition.bind(this), 500);
}

//Handle clear button tap
MainAssistant.prototype.handleClearTap = function() {

    //Clear the text box
    $("txtSearch").mojo.setValue("");

    //Uncheck all items in list
    var listWidgetSetup = this.controller.getWidgetSetup("searchResultsList");
    for (var i = 0; i < listWidgetSetup.model.items.length; i++) {
        listWidgetSetup.model.items[i].selectedState = false;
    }
    //Hide List
    $("showResultsList").style.display = "none";

    this.enableUI();
    $("txtSearch").mojo.focus();
}

//Handle map taps
MainAssistant.prototype.handleMapTap = function(event) {
    //Mojo.Additions.EnumerateObject(event);
    Mojo.Log.warn("** Current lat,long: " + this.mapData.centerpoint);
    var xSegments = Math.round($("imgMap").width / 3);
    var xPos = -2;
    for (var xCheck=0; xCheck < $("imgMap").width; xCheck=xCheck+xSegments)
    {
        if (event.x > xCheck)
            xPos++;
    }
    var ySegments = Math.round($("imgMap").height / 3);
    var yPos = -2;
    for (var yCheck=0; yCheck < $("imgMap").height; yCheck=yCheck+ySegments)
    {
        if (event.y > yCheck)
            yPos++;
    }
    /*
    Mojo.Log.info("You tapped X: " + event.x + ", Y: " + event.y);
    Mojo.Log.info("I calculated your tap segment as xpos " + xPos + ", ypos " + yPos);
    if (xPos > 0) { Mojo.Log.info("I should move east on the longitude"); }
    if (xPos < 0) { Mojo.Log.info("I should move west on the longitude"); }
    if (yPos > 0) { Mojo.Log.info("I should move south on the latitude"); }
    if (yPos < 0) { Mojo.Log.info("I should move north on the latitude"); }
    */
    var newLong = serviceModel.calculateNewLongitude(xPos, this.mapData.longitude, this.mapData.zoomLevel);
    var newLat = serviceModel.calculateNewLatitude(yPos, this.mapData.latitude, this.mapData.zoomLevel);
    Mojo.Log.warn("** New lat,long: " + newLat + "," + newLong);
    $("txtSearch").mojo.setValue(newLat + "," + newLong);
    this.handleSearchClick();
}

/* Map Stuff */

//Try to find the location
MainAssistant.prototype.getLocationFix = function() {
    Mojo.Log.info("Attempting to get location fix...");
    serviceModel.DoIPLocationFix(function(response) {
        if (response != null && response != "") {
            Mojo.Log.info("Got IP Fix response: " + response);
            var responseObj = JSON.parse(response);
            if (responseObj.status == "error") {
                Mojo.Log.error("Error message from server while trying IP GeoFix.");
                Mojo.Additions.ShowDialogBox("Server Error", "The server responded to the geolocation request with: " + responseObj.msg.replace("ERROR: ", ""));
            } else {
                if (responseObj.location && responseObj.location != "") {
                    //If we got a good looking response, remember it, and update the UI
                    
                    appModel.LastSearchResult = responseObj.location;
                    $("txtSearch").mojo.setValue(responseObj.location);
                    this.handleSearchClick();
                } else {
                    Mojo.Log.warn("IP GeoFix response was empty. Either there was no matching results, or there were server or connectivity problems.");
                    Mojo.Additions.ShowDialogBox("Geolocation Error", "The server could not locate this client.");
                }
            }
         }
    }.bind(this));
}

//Send a search request to Maps Service
MainAssistant.prototype.searchMapData = function(searchRequest) {
    Mojo.Log.info("Search requested: " + searchRequest);
    this.SearchValue = searchRequest;
    Mojo.Log.info("- Map type: " + appModel.AppSettingsCurrent["DefaultView"]);
    //var mapSize = window.innerWidth + "," + window.innerHeight;
    var mapSize = Mojo.Environment.DeviceInfo.screenWidth + "," + Mojo.Environment.DeviceInfo.screenHeight;
    Mojo.Log.info("- Map size: " + mapSize);

    serviceModel.DoMapDataRequest(searchRequest, appModel.AppSettingsCurrent["DefaultView"], mapSize, this.zoomLevel, function(response) {
        Mojo.Log.info("ready to process search results: " + response);
        if (response != null && response != "") {
            var responseObj = JSON.parse(response);
            if (responseObj.status == "error") {
                Mojo.Log.error("Error message from server while searching for map data: " + responseObj.msg);
                Mojo.Additions.ShowDialogBox("Server Error", "The server responded to the search request with: " + responseObj.msg.replace("ERROR: ", ""));
            } else {
                if (responseObj.latitude && responseObj.latitude && responseObj.img) {
                    //If we got a good looking response, remember it, and update the UI
                    Mojo.Log.info("Got map data!");
                    this.updateMapImage(responseObj);
                } else {
                    Mojo.Log.warn("Search results were empty. Either there was no matching result, or there were server or connectivity problems.");
                    Mojo.Additions.ShowDialogBox("No results", "The server did not report any matches for the search.");
                }
            }
        } else {
            Mojo.Log.error("No usable response from server while searching for Map Data: " + response);
            Mojo.Additions.ShowDialogBox("Server Error", "The server did not answer with a usable response to the search request. Check network connectivity and/or self-host settings.");
        }
        this.enableUI();
    }.bind(this));
}

//Update the UI with search results from Search Request
MainAssistant.prototype.updateMapImage = function(mapData) {
    if (mapData.img) {
        this.mapData = mapData;
        Mojo.Log.info("Updating map image with: " + mapData.img);
        $("imgMap").src = mapData.img;
        $("drawerControls").mojo.setOpenState(false);
    }
}

MainAssistant.prototype.changeZoom = function(up) {
    if (up) { //increase zoom
        if (this.zoomLevel < 20)
            this.zoomLevel++;
    } else { //decrease zoom
        if (this.zoomLevel >0)
            this.zoomLevel--;
    }
    this.handleSearchClick();
}

/* Screen Stuff */
MainAssistant.prototype.determineOrientation = function() {
    if (window.innerHeight > window.innerWidth)
        return "portrait";
    else
        return "landsapce";
}

MainAssistant.prototype.calculateControlsPosition = function() {
    Mojo.Log.info("Resizing viewer");
    var chromeHeight = document.getElementById("divTitle").offsetHeight;
    chromeHeight += document.getElementById("drawerControls").offsetHeight;
    Mojo.Log.info("chrome height: " + chromeHeight);
    var div = document.getElementById("divShowResultImage");

    var newWidth, newHeight;
    var screenHeight = window.innerHeight;
    var screenWidth = window.innerWidth;

    if (screenWidth < screenHeight) {   //Up orientation
        newWidth = "800px";
        newHeight = (1024 - chromeHeight) + "px";
    } else {    //Sideways
        newWidth = "1024px";
        newHeight = (800 - chromeHeight) + "px";
    }
    div.style.width = newWidth;
    div.style.height = newHeight;
    Mojo.Log.info("Viewer now: width " + newWidth + ", height " + newHeight);
    if (this.orientation != this.determineOrientation()){
        this.orientation = this.determineOrientation();
        Mojo.Log.info("Orientation changed, requesting new map");
        this.handleSearchClick();
    }
}

MainAssistant.prototype.disableUI = function(statusValue) {
    //start spinner
    //if (!this.spinnerModel.spinning) {
    //    this.spinnerModel.spinning = true;
    //    this.controller.modelChanged(this.spinnerModel);
    //}
    //if (statusValue && statusValue != "") {
    //    $("divWorkingStatus").style.display = "block";
    //    $("divStatusValue").innerHTML = statusValue;
    //} else {
    //    $("divWorkingStatus").style.display = "none";
    //}

    //disable submit button
    if (!this.submitBtnModel.disabled) {
        this.submitBtnModel.disabled = true;
        this.controller.modelChanged(this.submitBtnModel);
    }
}

MainAssistant.prototype.enableUI = function() {
    //stop spinner
    //this.spinnerModel.spinning = false;
    //this.controller.modelChanged(this.spinnerModel);

    //hide status
    //$("divWorkingStatus").style.display = "none";
    //$("divStatusValue").innerHTML = "";

    //enable submit button
    this.submitBtnModel.disabled = false;
    this.controller.modelChanged(this.submitBtnModel);
}

/* End of Life Stuff */
MainAssistant.prototype.deactivate = function(event) {
    /* remove any event handlers you added in activate and do any other cleanup that should happen before
       this scene is popped or another scene is pushed on top */
    Mojo.Event.stopListening(this.controller.get("btnGet"), Mojo.Event.tap, this.handleSearchClick);
    // Non-Mojo widgets
    Mojo.Event.stopListening(this.controller.get("divTitle"), Mojo.Event.tap, this.handleTitleTap);
    $("imgSearchClear").removeEventListener("click", this.handleClearTap);
    $("imgMap").removeEventListener("click", this.handleMapTap.bind(this));
    this.controller.document.removeEventListener("keyup", this.keyupHandler);
};

MainAssistant.prototype.cleanup = function(event) {
    /* this function should do any cleanup needed before the scene is destroyed as 
       a result of being popped off the scene stack */
};