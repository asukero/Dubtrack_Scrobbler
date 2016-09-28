// ==UserScript==
// @name        Dubstrack Scrobbler
// @namespace   thomas fossati
// @author      Thomas Fossati
// @description last.fm scrobbler for dubtrack.fm
// @match        *://dubtrack.fm/*
// @match        *://www.dubtrack.fm/*
// @version     1
// @require     http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.min.js
// @require     https://raw.githubusercontent.com/fxb/javascript-last.fm-api/master/lastfm.api.md5.js
// @require     http://cdn.rawgit.com/meetselva/attrchange/master/js/attrchange.js
// @run-at      document-end
// @grant       GM_xmlhttpRequest
// @grant       GM_registerMenuCommand
// @icon        https://www.dubtrack.fm/favicon-32x32.png?v=1
// ==/UserScript==

$(function() {

    var token = parseURL("token");
    if (token != null) {
        window.localStorage.setItem("token", token);
        console.log("[DubtrackScrobbler] session token retrieved");
    }

    var lastfm = new LastFM({
        apiKey: apiKey, //your api key
        apiSecret: apiSecret, //your api secret
        sk: window.localStorage.getItem("sk")
    });

    var Dubtrack = new DubtrackScrobbler(lastfm);

    if (window.localStorage.getItem("token") == null) {
        console.log("[DubtrackScrobbler] No token found, redirecting to lasfm page");
        lastfm.auth.getToken();
    } else {
        if (!lastfm.isAuthentized()) {

            lastfm.auth.getSession({
                token: window.localStorage.getItem("token")
            }, {
                success: function(responseXML) {
                    var sk = responseXML.getElementsByTagName("key")[0].childNodes[0].nodeValue;
                    window.localStorage.setItem("sk", sk);
                    lastfm.setSessionKey(sk);
                    console.log("[LastFM API] Authentized, starts scrobbling");
                    Dubtrack.startScrobbling();
                },
                error: function(code, message) {
                    console.error("[LastFM API] " + message);
                }
            });
        } else {
            console.log("[DubtrackScrobbler] Authentized, starts scrobbling");
            Dubtrack.startScrobbling();
        }
    }

});


function parseURL(val) {
    var result = null,
        tmp = [];
    location.search
        .substr(1)
        .split("&")
        .forEach(function(item) {
            tmp = item.split("=");
            if (tmp[0] === val) result = decodeURIComponent(tmp[1]);
        });
    return result;
}

function DubtrackScrobbler(_lastfm) {
    var lastfm = _lastfm;
    var self = this;
    var currentSong = "";

    this.startScrobbling = function() {
        setTimeout(function() {
            currentSong = $(".currentSong")[0];
            self.scrobble(currentSong);

            // $(currentSong).bind('textchange', function(event, previousText) {
            //     console.log("[DubtrackScrobbler] Track has changed");
            //     self.scrobble($(this).val());
            // });

        }, 4000);
    }
    this.scrobble = function(currentSong) {
        var cleanedSong = self.getArtistTrack($(currentSong).html());
        console.log(cleanedSong);
        lastfm.track.updateNowPlaying(cleanedSong, {
            success: function(responseXML) {
                console.log("[LastFM API] updateNowPlaying sucess");
            },
            error: function(message) {
                console.error("[LastFM API] " + message);
            }
        });

        var progressBar = $(".progressBg")[0];
        var firstPercentage = (progressBar.style.width);
        firstPercentage = parseFloat(firstPercentage.substring(0, firstPercentage.length - 1));
        console.log("First percentage : " + firstPercentage);


        var isScrobbled = false;
        $(progressBar).attrchange({
            trackValues: true,
            callback: function(e) {
                var percentage = e.newValue.slice(7); // removes "width: "
                percentage = parseFloat(percentage.substring(0, percentage.length - 2));

                if ((percentage > 99 || percentage > firstPercentage + 40) && !isScrobbled) {
                    isScrobbled = true;
                    console.log("[DubtrackScrobbler] now scrobbling");
                    lastfm.track.scrobble({
                        artist: cleanedSong.artist,
                        track: cleanedSong.track,
                        timestamp: Math.floor((new Date()).getTime() / 1000)
                    }, {
                        success: function(responseXML) {
                            console.log("[LastFM API] scrobble sucess");
                        },
                        error: function(message) {
                            console.error("[LastFM API] " + message);
                        }
                    });
                }
            }
        });
    }

    this.getArtistTrack = function(song) {
        var separator = findSeparators(song);

        var artist = null;
        var track = null;

        if (separator !== null) {
            artist = song.substr(0, separator.index);
            track = song.substr(separator.index + separator.length);
        }
        // Do some cleanup
        artist = artist.replace(/^\s+|\s+$/g, '');
        track = track.replace(/^\s+|\s+$/g, '');
        // Strip crap
        track = track.replace(/\s*\*+\s?\S+\s?\*+$/, ''); // **NEW**
        track = track.replace(/\s*\[[^\]]+\]$/, ''); // [whatever]
        track = track.replace(/\s*\([^\)]*version\)$/i, ''); // (whatever version)
        track = track.replace(/\s*\.(avi|wmv|mpg|mpeg|flv)$/i, ''); // video extensions
        track = track.replace(/\s*(of+icial\s*)?(music\s*)?video/i, ''); // (official)? (music)? video
        track = track.replace(/\s*\(\s*of+icial\s*\)/i, ''); // (official)
        track = track.replace(/\s*\(\s*[0-9]{4}\s*\)/i, ''); // (1999)
        track = track.replace(/\s+\(\s*(HD|HQ)\s*\)$/, ''); // HD (HQ)
        track = track.replace(/\s+(HD|HQ)\s*$/, ''); // HD (HQ)
        track = track.replace(/\s*video\s*clip/i, ''); // video clip
        track = track.replace(/\s+\(?live\)?$/i, ''); // live
        track = track.replace(/\(\s*\)/, ''); // Leftovers after e.g. (official video)
        track = track.replace(/^(|.*\s)"(.*)"(\s.*|)$/, '$2'); // Artist - The new "Track title" featuring someone
        track = track.replace(/^(|.*\s)'(.*)'(\s.*|)$/, '$2'); // 'Track title'
        track = track.replace(/^[\/\s,:;~-]+/, ''); // trim starting white chars and dash
        track = track.replace(/[\/\s,:;~-]+$/, ''); // trim trailing white chars and dash

        //My regexes
        track = track.replace(/\s*\([^\)]*full\ song\)$/i, ''); // (whatever full song)
        track = track.replace(/\s*(OF+ICIAL\s*)?(LYRIC\s*)?(VIDEO\s*)?/i, ''); // (OFFICIAL)? (MUSIC)? (VIDEO?)

        return {
            artist: artist,
            track: track
        };

    }


    var findSeparators = function(song) {
        var separators = [' -- ', '--', ' - ', ' – ', ' — ', '-', '–', '—', ':', '|', '///'];

        if (song === null || song.length === 0) {
            return null;
        }

        for (var i in separators) {
            var sep = separators[i];
            var index = song.indexOf(sep);

            if (index > -1) {
                return {
                    index: index,
                    length: sep.length
                };
            }
        }
        return {
            index: song.indexOf(" "),
            length: 1
        };
    }
}

function LastFM(options) {
    /* Set default values for required options. */
    var apiKey = options.apiKey || '';
    var apiSecret = options.apiSecret || '';
    var apiUrl = options.apiUrl || 'http://ws.audioscrobbler.com/2.0/';
    var sk = options.sk || null;

    /* Set API key. */
    this.setApiKey = function(_apiKey) {
        apiKey = _apiKey;
    };

    /* Set API key. */
    this.setApiSecret = function(_apiSecret) {
        apiSecret = _apiSecret;
    };

    /* Set API URL. */
    this.setApiUrl = function(_apiUrl) {
        apiUrl = _apiUrl;
    };

    this.setSessionKey = function(_sk) {
        sk = _sk;
    }

    this.isAuthentized = function() {
        return (sk != null);
    }

    var internalCall = function(params, callback, requestMethod) {
        if (requestMethod == 'POST') {
            var data = '';
            for (var property in params) {
                if (params.hasOwnProperty(property)) {
                    data += "&" + property + "=" + params[property];
                }
            }

            GM_xmlhttpRequest({
                method: "POST",
                url: apiUrl,
                data: data,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                onload: function(response) {
                    var responseXML = new DOMParser().parseFromString(response.responseText, "text/xml");
                    var lfm = $(responseXML).find("lfm");

                    if (lfm.attr("status") == "ok") {
                        callback.success(responseXML);
                    } else {
                        callback.error(lfm.find("error").text());
                    }
                }
            });

        } else {
            var data = "?";
            for (var property in params) {
                if (params.hasOwnProperty(property)) {
                    data += "&" + property + "=" + params[property];
                }
            }
            var requestRUL = apiUrl + data;
            GM_xmlhttpRequest({
                method: "GET",
                url: requestRUL,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                onload: function(response) {
                    var responseXML = new DOMParser().parseFromString(response.responseText, "text/xml");
                    var lfm = $(responseXML).find("lfm");
                    if (lfm.attr("status") == "ok") {
                        console.log("status ok");
                        callback.success(responseXML);
                    } else {
                        callback.error(lfm.find("error").text());
                    }


                }
            });
        }
    }

    /* Normal method call. */
    var call = function(method, params, callbacks, requestMethod) {
        /* Set default values. */
        params = params || {};
        callbacks = callbacks || {};
        requestMethod = requestMethod || 'GET';

        /* Add parameters. */
        params.method = method;
        params.api_key = apiKey;

        /* Call method. */
        internalCall(params, callbacks, requestMethod);
    };

    /* Signed method call. */
    var signedCall = function(method, params, callbacks, requestMethod) {
        /* Set default values. */
        params = params || {};
        callbacks = callbacks || {};
        requestMethod = requestMethod || 'GET';

        /* Add parameters. */
        params.method = method;
        params.api_key = apiKey;

        /* Add session key. */
        if (sk != null) {
            params.sk = sk;
        }
        /* Removes previous API signature */
        if ("api_sig" in params) {
            delete params.api_sig;
        }
        /* Get API signature. */
        params.api_sig = auth.getApiSignature(params);

        /* Call method. */
        internalCall(params, callbacks, requestMethod);
    };

    /* Auth methods. */
    this.auth = {

        getSession: function(params, callbacks) {
            signedCall('auth.getSession', params, callbacks);
        },

        getToken: function() {
            window.location.replace("http://www.last.fm/api/auth/?api_key=" + apiKey + "&cb=" + window.location.href);

        }
    };

    /* Track methods. */
    this.track = {
        getCorrection: function(params, callbacks) {
            call('track.getCorrection', params, callbacks);
        },

        love: function(params, callbacks) {
            signedCall('track.love', params, callbacks, 'POST');
        },

        scrobble: function(params, callbacks) {
            signedCall('track.scrobble', params, callbacks, 'POST');
        },

        unlove: function(params, session, callbacks) {
            signedCall('track.unlove', params, callbacks, 'POST');
        },

        updateNowPlaying: function(params, callbacks) {
            signedCall('track.updateNowPlaying', params, callbacks, 'POST');
        }
    };

    /* Private auth methods. */
    var auth = {
        getApiSignature: function(params) {
            var keys = Object.keys(params);
            var string = '';

            keys.sort();
            keys.forEach(function(key) {
                string += key + params[key];
            });

            string += apiSecret;
            return md5(string);
        }
    };
}
