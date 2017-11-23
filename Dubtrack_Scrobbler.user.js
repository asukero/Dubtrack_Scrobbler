// ==UserScript==
// @name        Dubtrack Scrobbler
// @author      Thomas Fossati
// @description last.fm scrobbler for dubtrack.fm
// @match       *://dubtrack.fm/*
// @match      *://www.dubtrack.fm/*
// @version     2
// @run-at      document-idle
// @grant       GM.xmlHttpRequest
// @icon        https://www.dubtrack.fm/favicon-32x32.png?v=1
// ==/UserScript==


let token = parseURL('token');

if (token != null) {
    window.localStorage.setItem('token', token);
    console.log('[DubtrackScrobbler] session token retrieved');
}

const lastfm = new LastFM({
  apiKey: "",//your apiKey
  apiSecret: "", //your secret
  sk: window.localStorage.getItem('sk')
});

const Dubtrack = new DubtrackScrobbler(lastfm);

if (window.localStorage.getItem('token') == null) {
    console.log('[DubtrackScrobbler] No token found, redirecting to lasfm page');
    lastfm.auth.getToken();
} else {
    if (!lastfm.isAuthenticated()) {
        lastfm.auth.getSession({
            token: window.localStorage.getItem('token')
        }, {
            success: function(responseXML) {
                let sk = responseXML.getElementsByTagName('key')[0].childNodes[0].nodeValue;
                window.localStorage.setItem('sk', sk);
                lastfm.setSessionKey(sk);
                console.log('[LastFM API] Authenticated, starts scrobbling');
                Dubtrack.startScrobbling();
            },
            error: function(message) {
                console.error('[LastFM API] ' + message);
            }
        });
    } else {
        console.log('[DubtrackScrobbler] Authenticated, starts scrobbling');
        Dubtrack.startScrobbling();
    }
}

function parseURL(val) {
    let result = null,
        tmp = [];
    location.search.substr(1).split('&').forEach(function(item) {
        tmp = item.split('=');
        if (tmp[0] === val) result = decodeURIComponent(tmp[1]);
    });
    return result;
}

function DubtrackScrobbler(_lastfm) {
    const lastfm = _lastfm;
    const self = this;

    this.startScrobbling = function() {
        setTimeout(function() {
            const currentTrack = document.querySelector('.currentSong');
            if (currentTrack.innerText !== 'No one is playing') {
                self.scrobble(currentTrack.innerText);
            } else {
                console.log('[DubtrackScrobbler] nothing to scrobble for now');
            }
            var currentTrackObserver = new MutationObserver(function(mutations) {
                if (currentTrack.innerText !== 'No one is playing') {
                    self.scrobble(currentTrack.innerText);
                } else {
                    console.log('[DubtrackScrobbler] nothing to scrobble for now');
                }
            });
            currentTrackObserver.observe(currentTrack, {
                childList: true
            });

        }, 4000);
    }
    this.scrobble = function(currentTrack) {

        console.log('[DubtrackScrobbler] starts scrobbling : ' + currentTrack);
        const cleanedTrack = self.getArtistTrack(currentTrack);

        if (cleanedTrack.artist != null && cleanedTrack.track != null) {
            lastfm.track.updateNowPlaying(cleanedTrack, {
                success: function(responseXML) {
                    console.log('[LastFM API] updateNowPlaying sucess');
                },
                error: function(message) {
                    console.error('[LastFM API] ' + message);
                }
            });

            const progressBar = document.querySelector('.progressBg');
            let firstPercentage = progressBar.style.width;
            firstPercentage = parseFloat(firstPercentage.substring(0, firstPercentage.length - 1));
            let isScrobbled = false;
            var progressBarObserver = new MutationObserver(function(mutations) {
                let percentage = progressBar.style.width;
                percentage = parseFloat(percentage.substring(0, percentage.length - 2));
                if ((percentage > 99 || percentage > firstPercentage + 40) && !isScrobbled) {
                    isScrobbled = true;
                    lastfm.track.scrobble({
                        artist: cleanedTrack.artist,
                        track: cleanedTrack.track,
                        timestamp: Math.floor((new Date()).getTime() / 1000)
                    }, {
                        success: function(responseXML) {
                            console.log('[LastFM API] scrobble sucess');
                        },
                        error: function(message) {
                            console.error('[LastFM API] ' + message);
                        }
                    });
                }
            });
            progressBarObserver.observe(progressBar, {
                attributes: true
            });
        } else {
            console.log("[DubtrackScrobbler] Cannot retrieve artist and track name, skipping track...");
        }
    }

    this.getArtistTrack = function(track) {
        track = track.replace(/^\[[^\]]+\]\s*-*\s*/i, ''); // remove [genre] from the beginning of the title

        const separator = findSeparators(track);

        if (separator === null || track.length === 0) {
            return {
                artist: null,
                track: null
            };
        }

        let artist = track.substr(0, separator.index);
        var track = track.substr(separator.index + separator.length);

        artist = artist.replace(/^\s+|\s+$/g, '');
        track = track.replace(/^\s+|\s+$/g, '');
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
        track = track.replace(/\s*\([^\)]*full\ song\)$/i, ''); // (whatever full song)
        track = track.replace(/\s*(OF+ICIAL\s*)?(LYRIC\s*)?(VIDEO\s*)?/i, ''); // (OFFICIAL)? (MUSIC)? (VIDEO?)
        track = track.replace(/\|(.*)?/i, ''); // | whatever after
        track = track.replace(/\s*\([^\)]*lyric[^\)]*\)$/i, ''); // (whatever lyric whatever)
        track = track.replace(/\s*\([^\)]*full[^\)]*\)$/i, ''); // (whatever full whatever)
        track = track.replace(/\s*\([^\)]*album[^\)]*\)$/i, ''); // (whatever album whatever)
        track = track.replace(/\s*\([^\)]*of+icial[^\)]*\)$/i, ''); // (whatever official whatever)
        track = track.replace(/\s*\(Of+icial[^\)]*\)$/i, ''); // (whatever Official whatever)

        return {
            artist: artist,
            track: track
        };
    }

    var findSeparators = function(track) {
        const separators = [' -- ', '--', ' - ', ' – ', ' — ', '-', '–', '—', ':', '|', '///'];
        if (track === null || track.length === 0) {
            return null;
        }

        for (let i in separators) {
            const sep = separators[i];
            const index = track.indexOf(sep);
            if (index > -1) {
                return {
                    index: index,
                    length: sep.length
                };
            }
        }
        return null;
    }
}

function LastFM(options) {
    var apiKey = options.apiKey || '';
    var apiSecret = options.apiSecret || '';
    var apiUrl = options.apiUrl || 'http://ws.audioscrobbler.com/2.0/';
    var sk = options.sk || null;
    this.setApiKey = function(_apiKey) {
        apiKey = _apiKey;
    };
    this.setApiSecret = function(_apiSecret) {
        apiSecret = _apiSecret;
    };
    this.setApiUrl = function(_apiUrl) {
        apiUrl = _apiUrl;
    };
    this.setSessionKey = function(_sk) {
        sk = _sk;
    }
    this.isAuthenticated = function() {
        return (sk != null);
    }
    var internalCall = function(params, callback, requestMethod) {
        if (requestMethod == 'POST') {
            let data = '';
            for (const [key, value] of Object.entries(params)) {
                data += '&' + key + '=' + value;
            }
            GM.xmlHttpRequest({
                method: 'POST',
                url: apiUrl,
                data: data,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                onload: function(response) {
                    const responseXML = new DOMParser().parseFromString(response.responseText, 'text/xml');
                    const lfm = responseXML.querySelector('lfm');
                    if (lfm.getAttribute('status') == 'ok') {
                        callback.success(responseXML);
                    } else {
                        callback.error(lfm.getElementsByTagName('error')[0].textContent);
                    }
                }
            });
        } else {
            let data = '?';
            for (const [key, value] of Object.entries(params)) {
                data += '&' + key + '=' + value;
            }
            const requestURL = apiUrl + data;
            GM.xmlHttpRequest({
                method: 'GET',
                url: requestURL,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                onload: function(response) {
                    const responseXML = new DOMParser().parseFromString(response.responseText, 'text/xml');
                    const lfm = responseXML.querySelector('lfm');
                    if (lfm.getAttribute('status') == 'ok') {
                        callback.success(responseXML);
                    } else {
                        callback.error(lfm.getElementsByTagName('error')[0].textContent);
                    }
                }
            });
        }
    } /* Normal method call. */

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
        } /* Removes previous API signature */

        if ('api_sig' in params) {
            delete params.api_sig;
        } /* Get API signature. */

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
            window.location.replace('http://www.last.fm/api/auth/?api_key=' + apiKey + '&cb=' + window.location.href);
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
            const keys = Object.keys(params);
            let string = '';
            keys.sort();
            for (const key of keys) {
                string += key + params[key];
            }

            string += apiSecret;
            return md5(unescape(encodeURIComponent(string)));
        }
    };
}

function md5(s) {
    function L(k, d) {
        return (k << d) | (k >>> (32 - d))
    }

    function K(G, k) {
        var I, d, F, H, x;
        F = (G & 2147483648);
        H = (k & 2147483648);
        I = (G & 1073741824);
        d = (k & 1073741824);
        x = (G & 1073741823) + (k & 1073741823);
        if (I & d) {
            return (x ^ 2147483648 ^ F ^ H)
        }
        if (I | d) {
            if (x & 1073741824) {
                return (x ^ 3221225472 ^ F ^ H)
            } else {
                return (x ^ 1073741824 ^ F ^ H)
            }
        } else {
            return (x ^ F ^ H)
        }
    }

    function r(d, F, k) {
        return (d & F) | ((~d) & k)
    }

    function q(d, F, k) {
        return (d & k) | (F & (~k))
    }

    function p(d, F, k) {
        return (d ^ F ^ k)
    }

    function n(d, F, k) {
        return (F ^ (d | (~k)))
    }

    function u(G, F, aa, Z, k, H, I) {
        G = K(G, K(K(r(F, aa, Z), k), I));
        return K(L(G, H), F)
    }

    function f(G, F, aa, Z, k, H, I) {
        G = K(G, K(K(q(F, aa, Z), k), I));
        return K(L(G, H), F)
    }

    function D(G, F, aa, Z, k, H, I) {
        G = K(G, K(K(p(F, aa, Z), k), I));
        return K(L(G, H), F)
    }

    function t(G, F, aa, Z, k, H, I) {
        G = K(G, K(K(n(F, aa, Z), k), I));
        return K(L(G, H), F)
    }

    function e(G) {
        var Z;
        var F = G.length;
        var x = F + 8;
        var k = (x - (x % 64)) / 64;
        var I = (k + 1) * 16;
        var aa = Array(I - 1);
        var d = 0;
        var H = 0;
        while (H < F) {
            Z = (H - (H % 4)) / 4;
            d = (H % 4) * 8;
            aa[Z] = (aa[Z] | (G.charCodeAt(H) << d));
            H++
        }
        Z = (H - (H % 4)) / 4;
        d = (H % 4) * 8;
        aa[Z] = aa[Z] | (128 << d);
        aa[I - 2] = F << 3;
        aa[I - 1] = F >>> 29;
        return aa
    }

    function B(x) {
        var k = "",
            F = "",
            G, d;
        for (d = 0; d <= 3; d++) {
            G = (x >>> (d * 8)) & 255;
            F = "0" + G.toString(16);
            k = k + F.substr(F.length - 2, 2)
        }
        return k
    }

    function J(k) {
        k = k.replace(/rn/g, "n");
        var d = "";
        for (var F = 0; F < k.length; F++) {
            var x = k.charCodeAt(F);
            if (x < 128) {
                d += String.fromCharCode(x)
            } else {
                if ((x > 127) && (x < 2048)) {
                    d += String.fromCharCode((x >> 6) | 192);
                    d += String.fromCharCode((x & 63) | 128)
                } else {
                    d += String.fromCharCode((x >> 12) | 224);
                    d += String.fromCharCode(((x >> 6) & 63) | 128);
                    d += String.fromCharCode((x & 63) | 128)
                }
            }
        }
        return d
    }
    var C = Array();
    var P, h, E, v, g, Y, X, W, V;
    var S = 7,
        Q = 12,
        N = 17,
        M = 22;
    var A = 5,
        z = 9,
        y = 14,
        w = 20;
    var o = 4,
        m = 11,
        l = 16,
        j = 23;
    var U = 6,
        T = 10,
        R = 15,
        O = 21;
    s = J(s);
    C = e(s);
    Y = 1732584193;
    X = 4023233417;
    W = 2562383102;
    V = 271733878;
    for (P = 0; P < C.length; P += 16) {
        h = Y;
        E = X;
        v = W;
        g = V;
        Y = u(Y, X, W, V, C[P + 0], S, 3614090360);
        V = u(V, Y, X, W, C[P + 1], Q, 3905402710);
        W = u(W, V, Y, X, C[P + 2], N, 606105819);
        X = u(X, W, V, Y, C[P + 3], M, 3250441966);
        Y = u(Y, X, W, V, C[P + 4], S, 4118548399);
        V = u(V, Y, X, W, C[P + 5], Q, 1200080426);
        W = u(W, V, Y, X, C[P + 6], N, 2821735955);
        X = u(X, W, V, Y, C[P + 7], M, 4249261313);
        Y = u(Y, X, W, V, C[P + 8], S, 1770035416);
        V = u(V, Y, X, W, C[P + 9], Q, 2336552879);
        W = u(W, V, Y, X, C[P + 10], N, 4294925233);
        X = u(X, W, V, Y, C[P + 11], M, 2304563134);
        Y = u(Y, X, W, V, C[P + 12], S, 1804603682);
        V = u(V, Y, X, W, C[P + 13], Q, 4254626195);
        W = u(W, V, Y, X, C[P + 14], N, 2792965006);
        X = u(X, W, V, Y, C[P + 15], M, 1236535329);
        Y = f(Y, X, W, V, C[P + 1], A, 4129170786);
        V = f(V, Y, X, W, C[P + 6], z, 3225465664);
        W = f(W, V, Y, X, C[P + 11], y, 643717713);
        X = f(X, W, V, Y, C[P + 0], w, 3921069994);
        Y = f(Y, X, W, V, C[P + 5], A, 3593408605);
        V = f(V, Y, X, W, C[P + 10], z, 38016083);
        W = f(W, V, Y, X, C[P + 15], y, 3634488961);
        X = f(X, W, V, Y, C[P + 4], w, 3889429448);
        Y = f(Y, X, W, V, C[P + 9], A, 568446438);
        V = f(V, Y, X, W, C[P + 14], z, 3275163606);
        W = f(W, V, Y, X, C[P + 3], y, 4107603335);
        X = f(X, W, V, Y, C[P + 8], w, 1163531501);
        Y = f(Y, X, W, V, C[P + 13], A, 2850285829);
        V = f(V, Y, X, W, C[P + 2], z, 4243563512);
        W = f(W, V, Y, X, C[P + 7], y, 1735328473);
        X = f(X, W, V, Y, C[P + 12], w, 2368359562);
        Y = D(Y, X, W, V, C[P + 5], o, 4294588738);
        V = D(V, Y, X, W, C[P + 8], m, 2272392833);
        W = D(W, V, Y, X, C[P + 11], l, 1839030562);
        X = D(X, W, V, Y, C[P + 14], j, 4259657740);
        Y = D(Y, X, W, V, C[P + 1], o, 2763975236);
        V = D(V, Y, X, W, C[P + 4], m, 1272893353);
        W = D(W, V, Y, X, C[P + 7], l, 4139469664);
        X = D(X, W, V, Y, C[P + 10], j, 3200236656);
        Y = D(Y, X, W, V, C[P + 13], o, 681279174);
        V = D(V, Y, X, W, C[P + 0], m, 3936430074);
        W = D(W, V, Y, X, C[P + 3], l, 3572445317);
        X = D(X, W, V, Y, C[P + 6], j, 76029189);
        Y = D(Y, X, W, V, C[P + 9], o, 3654602809);
        V = D(V, Y, X, W, C[P + 12], m, 3873151461);
        W = D(W, V, Y, X, C[P + 15], l, 530742520);
        X = D(X, W, V, Y, C[P + 2], j, 3299628645);
        Y = t(Y, X, W, V, C[P + 0], U, 4096336452);
        V = t(V, Y, X, W, C[P + 7], T, 1126891415);
        W = t(W, V, Y, X, C[P + 14], R, 2878612391);
        X = t(X, W, V, Y, C[P + 5], O, 4237533241);
        Y = t(Y, X, W, V, C[P + 12], U, 1700485571);
        V = t(V, Y, X, W, C[P + 3], T, 2399980690);
        W = t(W, V, Y, X, C[P + 10], R, 4293915773);
        X = t(X, W, V, Y, C[P + 1], O, 2240044497);
        Y = t(Y, X, W, V, C[P + 8], U, 1873313359);
        V = t(V, Y, X, W, C[P + 15], T, 4264355552);
        W = t(W, V, Y, X, C[P + 6], R, 2734768916);
        X = t(X, W, V, Y, C[P + 13], O, 1309151649);
        Y = t(Y, X, W, V, C[P + 4], U, 4149444226);
        V = t(V, Y, X, W, C[P + 11], T, 3174756917);
        W = t(W, V, Y, X, C[P + 2], R, 718787259);
        X = t(X, W, V, Y, C[P + 9], O, 3951481745);
        Y = K(Y, h);
        X = K(X, E);
        W = K(W, v);
        V = K(V, g)
    }
    var i = B(Y) + B(X) + B(W) + B(V);
    return i.toLowerCase()
};
