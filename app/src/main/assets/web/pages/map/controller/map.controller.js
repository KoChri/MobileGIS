/**
 * Created by Christoph on 12.11.2015.
 */

define('Map', [
    "jquery",
    "jqueryMobile",
    "ol3",
    "Overpass",
    "Database",
    "MarkerManager",
    "PouchDB",
    "Bootstrap",
    "Editable"
], function ($, jqm, ol, Overpass, Database, MarkerManager, PouchDB) {
    'use strict';

    var markerManager = new MarkerManager();
    var db = new Database();

    $(function () {
        console.log("map_controller");

        var view = new ol.View({
            center: ol.proj.transform([16, 48], 'EPSG:4326', 'EPSG:3857'),
            zoom: 5
        });
        var myFormat = function (dgts) {
            return (
                function (coord1) {
                    var coord2 = [coord1[1], coord1[0]];
                    return ol.coordinate.toStringXY(coord2, dgts);
                });
        };
        var mousePositionControl = new ol.control.MousePosition({
            coordinateFormat: myFormat(3),
            projection: 'EPSG:4326',
            undefinedHTML: '&nbsp;',
            target: document.getElementById('mouse-location')
        });
        var map = new ol.Map({
            target: 'olMap',
            layers: [
                new ol.layer.Tile({
                    source: new ol.source.MapQuest({layer: 'osm'})
                }),
                //new ol.layer.Tile({
                //    source: new ol.source.MapQuest({layer: 'sat'})
                //})
            ],
            view: view,
            interactions: ol.interaction.defaults().extend([
                new ol.interaction.DragRotateAndZoom()
            ]),
            controls: ol.control.defaults({
                attributionOptions: /** @type {olx.control.AttributionOptions} */ ({
                    collapsible: false
                })
            }).extend([mousePositionControl])
        });

        map.addEventListener('click', function (event) {
            var coord3857 = event.coordinate;
            var coord4326 = ol.proj.transform(coord3857, 'EPSG:3857', 'EPSG:4326');

            var feature = map.forEachFeatureAtPixel(event.pixel,
                function (feature, layer) {
                    return feature;
                }
            );

            if (feature) {
                if (feature.getProperties().type === 'Marker') {
                    var marker = markerManager.getMarker(feature.getProperties().id);

                    markerManager.removeUnsavedMarkers();
                    markerManager.openPopup(marker, function (storeData) {
                        db.insertLocal(storeData);
                    });
                }
            } else {
                var markerOptions = {
                    id: db.UUID(),
                    coord: coord3857,
                    data: undefined,
                    popupOpen: true,
                    saved: false,
                    target: map
                };

                var overpass = new Overpass();
                overpass.bboxset([coord4326[1], coord4326[0], coord4326[1] + 0.001, coord4326[0] + 0.001]);//'48.211,16.357,48.212,16.358');
                var request = overpass.sendRequest();
                request.then(function (data) {
                    // just take first element
                    if (data > 1) {
                        data = [data[0]];
                    }
                    markerOptions.data = data;
                    openMarker(markerOptions)
                }, function(error) {
                    markerOptions.data = [overpass.getTemplate()];
                    openMarker(markerOptions)
                });

            }

            function openMarker(markerOptions) {
                markerManager.removeUnsavedMarkers();
                var marker = markerManager.addMarker(markerOptions);
                markerManager.openPopup(marker, function (storeData) {
                    db.insertLocal(storeData);
                });
            }

        });

        // synchronize with database
        var syncBtn = document.getElementById('sync-button');
        var syncOpt = {live: true, retry: true};
        PouchDB.sync(db.browserDb, db.serverDb, syncOpt).on('change', function (info) {
            for (var i = 0; i < info.change.docs.length; i++) {
                if (info.change.docs[i]._deleted === true) {
                    var todelete = markerManager.getMarker(info.change.docs[i]._id);
                    markerManager.removeMarker(todelete);
                }
            }
        });
        syncBtn.addEventListener('click', function () {
            db.syncDB();
            db.browserDb.allDocs({
                include_docs: true
            }).then(function (docs) {
                for (var i = 0; i < docs.total_rows; i++) {
                    var markerOptions = {
                        id: docs.rows[i].id,
                        coord: docs.rows[i].doc.geometry.coordinates,
                        data: docs.rows[i].doc.properties,
                        popupOpen: true,
                        saved: true,
                        target: map
                    };
                    if(!markerManager.getMarker(markerOptions.id)) {
                        markerManager.addMarker(markerOptions);
                    }
                }
            })

        });

        function connectionAvailable() {
            $.ajaxSetup({async: false});
            var re = "";
            var r = Math.round(Math.random() * 10000);
            $.get("http://google.com", {subins: r}, function (d) {
                re = true;
            }).error(function () {
                re = false;
            });
            return re;
        }

        // geolocate device
        var locateEnabled = false;
        var firstInit = false;
        $("#info-button").hide();
        var geolocateBtn = document.getElementById('locate-button');
        geolocateBtn.addEventListener('click', function () {
            locateEnabled = !locateEnabled;
            if (locateEnabled) {
                $("#locate-button .ui-btn-text").text("Disable");
                $("#info-button").show();
            } else {
                $("#locate-button .ui-btn-text").text("Locate Me!");
                $("#info-button").hide();
            }

            firstInit = true;
            geolocation.setTracking(locateEnabled); // Start position tracking
        });

        // Geolocation Control
        var geolocation = new ol.Geolocation(/** @type {olx.GeolocationOptions} */ ({
            projection: view.getProjection(),
            trackingOptions: {
                //maximumAge: 10000,
                enableHighAccuracy: true
                //timeout: 600000
            }
        }));

        // Listen to position changes
        geolocation.on('change', function (evt) {
            var position = geolocation.getPosition();
            //var altitude = geolocation.getAltitude();
            //var altitudeAccuracy = geolocation.getAltitudeAccuracy();
            //var accuracy = geolocation.getAccuracy();
            //var heading = geolocation.getHeading() || 0;
            //var speed = geolocation.getSpeed() || 0;
            //var m = Date.now();

            //var html = [
            //    'Position: ' + position[0].toFixed(2) + ', ' + position[1].toFixed(2) + ' [m]',
            //    'Altitude: ' + altitude + ' [m]',
            //    'Accuracy: ' + 'xy - ' + accuracy + ', h - ' + altitudeAccuracy + ' [m]',
            //    'Heading: ' + Math.round(radToDeg(heading)) + '&deg;',
            //    'Speed: ' + (speed * 3.6).toFixed(1) + ' km/h'
            //].join('<br />');
            //document.getElementById('info-button').innerHTML = html;

            if (firstInit) {
                doBounce(position);
            }
            firstInit = false;
        });

        geolocation.on('error', function () {
            alert('geolocation error');
        });

        //var accuracyFeature = new ol.Feature();
        //geolocation.on('change:accuracyGeometry', function () {
        //    accuracyFeature.setGeometry(geolocation.getAccuracyGeometry());
        //});

        var positionFeature = new ol.Feature();
        positionFeature.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({
                    color: '#3399CC'
                }),
                stroke: new ol.style.Stroke({
                    color: '#fff',
                    width: 2
                })
            })
        }));

        geolocation.on('change:position', function () {
            var coordinates = geolocation.getPosition();
            positionFeature.setGeometry(coordinates ?
                new ol.geom.Point(coordinates) : null);
        });

        var featuresOverlay = new ol.layer.Vector({
            map: map,
            source: new ol.source.Vector({
                features: [positionFeature]
                //features: [accuracyFeature, positionFeature]
            })
        });

        function doBounce(location) {
            // bounce by zooming out one level and back in
            var bounce = ol.animation.bounce({
                resolution: map.getView().getResolution() * 2
            });
            // start the pan at the current center of the map
            var pan = ol.animation.pan({
                source: map.getView().getCenter()
            });
            map.beforeRender(bounce);
            map.beforeRender(pan);
            // when we set the center to the new location, the animated move will
            // trigger the bounce and pan effects
            map.getView().setCenter(location);
            map.getView().setZoom(17);
        }

        // convert radians to degrees
        function radToDeg(rad) {
            return rad * 360 / (Math.PI * 2);
        }

        // convert degrees to radians
        function degToRad(deg) {
            return deg * Math.PI * 2 / 360;
        }

        // modulo for negative values
        function mod(n) {
            return ((n % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
        }

    });
});
