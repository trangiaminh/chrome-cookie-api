(function() {
  let _isFirefox = undefined;

  function isFirefox() {
    if (_isFirefox !== undefined) {
      return _isFirefox;
    }
    _isFirefox = navigator.userAgent.indexOf("Firefox") !== -1;
    return _isFirefox;
  }

  function downloadFile(
    content,
    fileName = "data.txt",
    contentType = "text/plain"
  ) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
  }

  function createCookieDetailFromCookie(
    cookieObj,
    { storeId, ff = isFirefox() }
  ) {
    const cookieDetail = {
      ...cookieObj
    };

    cookieDetail.url = getCookieUrl(cookieDetail);
    if (cookieDetail.hostOnly) {
      delete cookieDetail.domain;
    }
    delete cookieDetail.hostOnly;

    if (cookieDetail.session) {
      delete cookieDetail.expirationDate;
    }
    delete cookieDetail.session;

    if (ff) {
      delete cookieDetail.firstPartyDomain;
    }

    if (!!storeId) {
      cookieDetail.storeId = storeId;
    }

    return cookieDetail;
  }

  function getCookieUrl(cookie) {
    return (
      (cookie.secure ? "https" : "http") +
      "://" +
      (cookie.domain &&
      cookie.domain.length > 0 &&
      cookie.domain.charAt(0) === "."
        ? cookie.domain.substring(1)
        : cookie.domain) +
      cookie.path
    );
  }

  function getAllCookies({ storeId } = {}) {
    var search = {};
    if (isFirstPartyIsolationSupported()) {
      search.firstPartyDomain = null; // get all
    }
    if (!!storeId) {
      search.storeId = storeId; // cookie store id
    }
    // https://developer.chrome.com/extensions/cookies#method-getAll
    return new Promise(resolve => {
      chrome.cookies.getAll(search, cookies => {
        return resolve(cookies);
      });
    });
  }

  function removeCookie(cookie = {}, { logError = true }) {
    const url = getCookieUrl(cookie);
    const data = {
      url: url,
      name: cookie.name,
      storeId: cookie.storeId
    };
    if (isFirstPartyIsolationSupported()) {
      data.firstPartyDomain = cookie.firstPartyDomain;
    }
    return new Promise((resolve, reject) => {
      chrome.cookies.remove(data, obj => {
        if (!obj) {
          const errorObj = {
            msg: "Remove cookie fail! " + chrome.runtime.lastError.message,
            data
          };
          if (logError) {
            console.error(errorObj);
          }
          return reject(errorObj);
        }

        resolve(obj);
      });
    });
  }

  function setCookie(
    cookie = {},
    { storeId, ff = isFirefox(), now = new Date().getTime() / 1000 } = {}
  ) {
    const cookieDetail = createCookieDetailFromCookie(cookie, { ff, storeId });
    if (cookieDetail.expirationDate < now) {
      console.log(
        "Skipped expired cookie " +
          cookieDetail.name +
          " of URL " +
          cookieDetail.url
      );
      return Promise.resolve({ status: 0, cookie: cookieDetail });
    }

    return Promise.resolve()
      .then(() =>
        removeCookie(cookieDetail, { logError: false }).catch(() => {})
      )
      .then(
        () =>
          new Promise((resolve, reject) => {
            chrome.cookies.set(cookieDetail, cookie => {
              if (!cookie) {
                const errorObj = {
                  msg: "Set cookie fail! " + chrome.runtime.lastError.message,
                  data: cookieDetail
                };
                return reject(errorObj);
              }

              resolve({ status: 1, cookie });
            });
          })
      );
  }

  function deleteAllCookies() {
    return new Promise((resolve, reject) => {
      chrome.cookies.getAllCookieStores(function(stores) {
        const promise = stores.reduce((promise, store) => {
          return promise
            .then(() =>
              getAllCookies({ storeId: store.id }).catch(console.error)
            )
            .then(cookies => {
              if (cookies.length > 0) {
                return cookies.reduce((p, c) => {
                  return p.then(() => removeCookie(c).catch(() => {}));
                }, Promise.resolve());
              }
            });
        }, Promise.resolve());

        promise.then(resolve).catch(reject);
      });
    });
  }

  function exportAllCookies({ fileName = "cookies.json", storeId = "0" } = {}) {
    return getAllCookies({ storeId }).then(cookies => {
      const str = JSON.stringify(cookies);
      downloadFile(str, fileName, "application/json");
      return str;
    });
  }

  function importAllCookies({ jsonStr, cookies, storeId = "0" } = {}) {
    if (!cookies && !jsonStr) {
      const errorObj = { msg: "jsonStr or cookies is required!" };
      console.error(errorObj);
      return Promise.reject(errorObj);
    }

    if (!cookies) {
      try {
        cookies = JSON.parse(jsonStr);
      } catch (e) {
        console.error({ msg: "Json parse fail!", error: e });
        return Promise.reject({ msg: "Json parse fail!", error: e });
      }
    }

    let ff = isFirefox();
    console.log(
      "Importing " + cookies.length + " cookies... " + (ff ? " on Firefox" : "")
    );

    const now = new Date().getTime() / 1000;
    let totalAddedCookies = 0;
    const errors = [];
    const promise = cookies.reduce((promise, c) => {
      return promise.then(() =>
        setCookie(c, { storeId, ff, now })
          .then(({ status }) => {
            if (status > 0) {
              totalAddedCookies += 1;
            }
          })
          .catch(error => {
            errors.push(error);
          })
      );
    }, Promise.resolve());

    promise.then(() => {
      console.log("Imported " + totalAddedCookies + " cookies.");

      if (errors.length > 0) {
        console.error({ msg: "Failed to import cookies!", errors });
        throw { msg: "Failed to import cookies!", errors };
      }
    });

    return promise;
  }

  window.ChromeCookieAPI = {
    createCookieDetailFromCookie,
    getAllCookies,
    setCookie,
    removeCookie,
    deleteAllCookies,
    importAllCookies,
    exportAllCookies
  };
})();

// export all cookies to json file
// window.ChromeCookieAPI.exportAllCookies({fileName: "chrome_cookies.json", storeId: "0"});

// import all cookies from json string
// var jsonStr = `[{
//     "domain": "abc.com",
//     "expirationDate": 253402300799,
//     "hostOnly": true,
//     "httpOnly": false,
//     "name": "name",
//     "path": "/123/456",
//     "sameSite": "unspecified",
//     "secure": true,
//     "session": false,
//     "storeId": "0",
//     "value": "value"
// }]`;
// window.ChromeCookieAPI.importAllCookies({ jsonStr, storeId: "0" });

// import all cookies from cookies array
// window.ChromeCookieAPI.importAllCookies({ cookies, storeId: "0" });
