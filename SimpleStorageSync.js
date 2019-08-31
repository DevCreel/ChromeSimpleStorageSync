function SimpleStorageSync() {
    "use strict";

    function getCacheKey(key, i) {
        return key + "_" + i;
    }

    function lengthUtf8(str) {
        return new Blob([str]).size;
    }

    function substrUTF8(str, n) {
        let len = Math.min(n, str.length);
        let i, cs, c = 0, bytes = 0;
        for (i = 0; i < len; i++) {
            c = str.charCodeAt(i);
            cs = 1;
            if (c >= 128) cs++;
            if (c >= 2048) cs++;
            if (c >= 0xD800 && c < 0xDC00) {
                c = str.charCodeAt(++i);
                if (c >= 0xDC00 && c < 0xE000) {
                    cs++;
                } else {
                    // you might actually want to throw an error
                    i--;
                }
            }
            if (n < (bytes += cs)) break;
        }

        return str.substr(0, i);
    }

    /**
     * Compresses an object, and breaks it into parts
     *
     * @param {string} key
     * @param {string} value
     * @param {function(): void=} callback
     */
    this.set = function(key, value, callback) {
        let str = LZStringUnsafe.compressToBase64(JSON.stringify(value)), i = 0, data = {},
            maxBytesPerItem = chrome.storage.sync.QUOTA_BYTES_PER_ITEM - 2,
            // since the key uses up some per-item quota, use
            // "maxValueBytes" to see how much is left for the value
            maxValueBytes, index, segment, counter;

        // split str into chunks and store them in an object indexed by `key_i`
        while(str.length > 0) {
            index = getCacheKey(key, i++);
            maxValueBytes = maxBytesPerItem - lengthUtf8(index);

            counter = maxValueBytes;
            segment = substrUTF8(str, counter);

            data[index] = segment;
            str = str.substr(segment.length);
        }

        // later used by get function
        data[key] = i;

        // remove useless parts of stored data
        chrome.storage.sync.clear(function() {
            chrome.storage.sync.set(data, callback);
        });
    };

    /**
     * Receives parts of stored data, combines them and decompresses
     *
     * @param {string} key
     * @param {function(string):void=} callback
     */
    this.get = function(key, callback) {
        chrome.storage.sync.get(null, result => {
            // check the existence of a limit
            if (key in result && result[key]) {
                let value = '', current;

                // collect data
                for (let i = 0; i <= result[key]; i++) {
                    current = result[getCacheKey(key, i)];
                    if (current === undefined) {
                        break;
                    }
                    value = value + current;
                }

                // decompress data
                callback(JSON.parse(LZStringUnsafe.decompressFromBase64(value)));
            } else {
                callback(null);
            }
        });
    };
}
