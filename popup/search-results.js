/* global handleEvent tryJSONparse getStylesSafe BG */
'use strict';

(() => {
  Promise.all([getActiveTab(), onDOMready()])
    .then(([tab]) => {
      $('#find-styles-link').href = searchUserstyles().getSearchPageURL(tab.url);

      $('#find-styles-link').onclick = event => {
        // Only load search results inline if option is selected.
        if ($('#find-styles-inline').checked) {
          // Hide 'inline' checkbox.
          $('#find-styles-inline-group').classList.add('hidden');
          $('#find-styles-inline').checked = false;

          const searchResults = searchResultsController();
          searchResults.init();
          searchResults.load();

          // Avoid propagating click to anchor/href
          event.preventDefault();
          return false;
        } else {
          // Open anchor href in new tab.
          handleEvent.openURLandHide.call($('#find-styles-link'), event);
        }
      };
    });

  /**
   * Represents the search results within the Stylus popup.
   * @returns {Object} Includes load(), next(), and prev() methods to alter the search results.
   */
  function searchResultsController() {
    const DISPLAYED_RESULTS_PER_PAGE = 10; // Number of results to display in popup.html
    const DELAY_AFTER_FETCHING_STYLES = 0; // Millisecs to wait before fetching next batch of search results.
    const DELAY_BEFORE_SEARCHING_STYLES = 0; // Millisecs to wait before fetching .JSON for next search result.
    const searchAPI = searchUserstyles();
    const unprocessedResults = []; // Search results not yet processed.
    const processedResults = []; // Search results that are not installed and apply ot the page (includes 'json' field with full style).
    const BLANK_PIXEL_DATA = 'data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAA' +
                             'C1HAwCAAAAC0lEQVR42mOcXQ8AAbsBHLLDr5MAAAAASUVORK5CYII=';
    let loading = false;
    let category; // Category for the active tab's URL.
    let currentDisplayedPage = 1; // Current page number in popup.html

    return {init, load, next, prev};

    function init() {
      $('#search-results-nav-prev').onclick = prev;
      $('#search-results-nav-next').onclick = next;
      document.body.classList.add('search-results-shown');
      window.scrollTo(0, 0);
    }

    /**
     * Sets loading status of search results.
     * @param {Boolean} isLoading If search results are idle (false) or still loading (true).
     */
    function setLoading(isLoading) {
      if (loading !== isLoading) {
        loading = isLoading;

        render(); // Refresh elements that depend on `loading` state.

        if (isLoading) {
          // Show spinner
          $('#search-results').appendChild(
            $create(
              '.lds-spinner',
              new Array(12).fill($create('div')).map(e => e.cloneNode()))
          );
        } else {
          // Hide spinner
          $.remove('#search-results > .lds-spinner');
        }
      }
    }

    function render() {
      $('#search-results-list').textContent = ''; // Clear search results

      const startIndex = (currentDisplayedPage - 1) * DISPLAYED_RESULTS_PER_PAGE;
      const endIndex = currentDisplayedPage * DISPLAYED_RESULTS_PER_PAGE;
      const displayedResults = processedResults.slice(startIndex, endIndex);
      displayedResults.forEach(resultToDisplay => {
        createSearchResultNode(resultToDisplay);
      });

      $('#search-results-nav-prev').disabled = (currentDisplayedPage <= 1 || loading);
      $('#search-results-nav-current-page').textContent = currentDisplayedPage;

      let totalResultsCount = processedResults.length;
      if (unprocessedResults.length > 0) {
        // Add 1 page if there's results left to process.
        totalResultsCount += DISPLAYED_RESULTS_PER_PAGE;
      }
      const totalPageCount = Math.ceil(Math.max(1, totalResultsCount / DISPLAYED_RESULTS_PER_PAGE));
      $('#search-results-nav-next').disabled = (currentDisplayedPage >= totalPageCount || loading);
      $('#search-results-nav-total-pages').textContent = totalPageCount;

      // Fill in remaining search results with blank results + spinners
      const maxResults = currentDisplayedPage < totalPageCount
        ? DISPLAYED_RESULTS_PER_PAGE
        : displayedResults.length + unprocessedResults.length;
      for (let i = displayedResults.length; i < maxResults; i++) {
        createLoadingSearchResultNode();
      }
    }

    /**
     * @returns {Boolean} If we should process more results.
     */
    function shouldLoadMore() {
      return (processedResults.length < currentDisplayedPage * DISPLAYED_RESULTS_PER_PAGE);
    }

    function loadMoreIfNeeded() {
      if (shouldLoadMore()) {
        setTimeout(load, DELAY_BEFORE_SEARCHING_STYLES);
      }
    }

    /** Increments currentDisplayedPage and loads results. */
    function next() {
      currentDisplayedPage += 1;
      render();
      window.scrollTo(0, 0);
      loadMoreIfNeeded();
    }

    /** Decrements currentPage and loads results. */
    function prev() {
      currentDisplayedPage = Math.max(1, currentDisplayedPage - 1);
      window.scrollTo(0, 0);
      render();
    }

    /**
     * Display error message to user.
     * @param {string} message  Message to display to user.
     */
    function error(reason) {
      let message;
      if (reason === 404) {
        // TODO: i18n message
        message = 'No results found';
      } else {
        message = 'Error loading search results: ' + reason;
      }
      $('#search-results').classList.add('hidden');
      $('#search-results-error').textContent = message;
      $('#search-results-error').classList.remove('hidden');
    }

    /**
     * Initializes search results container, starts fetching results.
     */
    function load() {
      if (unprocessedResults.length > 0) {
        // Keep processing search results if there are any.
        processNextResult();
      } else if (searchAPI.isExhausted()) {
        // Stop if no more search results.
        if (processedResults.length === 0) {
          // No results
          error(404);
        }
      } else {
        setLoading(true);
        // Search for more results.
        $('#search-results').classList.remove('hidden');
        $('#search-results-error').classList.add('hidden');

        // Discover current tab's URL & the "category" for the URL, then search.
        getActiveTab().then(tab => {
          category = searchAPI.getCategory(tab.url);
          searchAPI.search(category)
            .then(searchResults => {
              setLoading(false);
              if (searchResults.data.length === 0) {
                throw 404;
              }
              unprocessedResults.push.apply(unprocessedResults, searchResults.data);
              processNextResult();
            })
            .catch(error);
        });
      }
    }

    /**
     * Processes the next search result in `unprocessedResults` and adds to `processedResults`.
     * Skips installed/non-applicable styles.
     * Fetches more search results if unprocessedResults is empty.
     * Recurses until shouldLoadMore() is false.
     */
    function processNextResult() {
      if (!shouldLoadMore()) {
        return;
      }

      if (unprocessedResults.length === 0) {
        // No more results to process
        loadMoreIfNeeded();
        return;
      }

      // Process the next result in the queue.
      const nextResult = unprocessedResults.shift();
      isStyleInstalled(nextResult)
        .then(isInstalled => {
          if (isInstalled) {
            // Style already installed, skip it.
            setTimeout(processNextResult, 0); // Keep processing
          } else if (nextResult.category !== 'site') {
            // Style is not for a website, skip it.
            setTimeout(processNextResult, 0); // Keep processing
          } else {
            // Style not installed.
            searchAPI.fetchStyle(nextResult.id) // for "style_settings" (customizations)
              .then(userstyleObject => {
                // Store style settings for detecting customization later.
                nextResult.style_settings = userstyleObject.style_settings;

                processedResults.push(nextResult);
                render();
                setTimeout(processNextResult, DELAY_AFTER_FETCHING_STYLES); // Keep processing
              })
              .catch(reason => {
                console.log('processNextResult(', nextResult.id, ') => [ERROR]: ', reason);
                setTimeout(processNextResult, DELAY_AFTER_FETCHING_STYLES); // Keep processing
              });
          }
        });
    }

    /**
     * Promises if the given searchResult matches an already-installed style.
     * @param {Object} userstyleSearchResult Search result object from userstyles.org
     * @returns {Promise<boolean>} Resolves if the style is installed.
     */
    function isStyleInstalled(userstyleSearchResult) {
      return new Promise(function (resolve, reject) {
        getStylesSafe()
          .then(installedStyles => {
            const matchingStyles = installedStyles.filter(installedStyle => {
              // Compare installed name to search result name.
              let isMatch = installedStyle.name === userstyleSearchResult.name;
              // Compare if search result ID (userstyles ID) is mentioned in the installed updateUrl.
              if (installedStyle.updateUrl) {
                isMatch &= installedStyle.updateUrl.includes('/' + userstyleSearchResult.id + '.json');
              }
              return isMatch;
            });
            resolve(matchingStyles.length > 0);
          })
          .catch(reject);
      });
    }

    function createLoadingSearchResultNode() {
      const entry = template.emptySearchResult.cloneNode(true);
      entry.appendChild(
        $create(
          '.lds-spinner',
          new Array(12).fill($create('div')).map(e => e.cloneNode()))
      );
      $('#search-results-list').appendChild(entry);
    }

    /**
     * Constructs and adds the given search result to the popup's Search Results container.
     * @param {Object} userstyleSearchResult The SearchResult object from userstyles.org
     */
    function createSearchResultNode(userstyleSearchResult) {
      /*
        userstyleSearchResult format: {
          id: 100835,
          name: "Reddit Flat Dark",
          screenshot_url: "19339_after.png",
          description: "...",
          user: {
            id: 48470,
            name: "holloh"
          },
          style_settings: [...]
        }
      */

      const entry = template.searchResult.cloneNode(true);
      Object.assign(entry, {
        id: 'search-result-' + userstyleSearchResult.id,
        onclick: handleEvent.openURLandHide
      });
      $('#search-results-list').appendChild(entry);

      const searchResultName = userstyleSearchResult.name;
      const title = $('.search-result-title', entry);
      Object.assign(title, {
        textContent: searchResultName,
        onclick: handleEvent.openURLandHide,
        href: searchAPI.BASE_URL + userstyleSearchResult.url
      });

      const screenshot = $('.search-result-screenshot', entry);
      let screenshotUrl = userstyleSearchResult.screenshot_url;
      if (screenshotUrl === null) {
        screenshotUrl = BLANK_PIXEL_DATA;
        screenshot.classList.add('no-screenshot');
      } else if (RegExp(/^[0-9]*_after.(jpe?g|png|gif)$/i).test(screenshotUrl)) {
        screenshotUrl = searchAPI.BASE_URL + '/style_screenshot_thumbnails/' + screenshotUrl;
      }
      Object.assign(screenshot, {
        src: screenshotUrl
      });

      const searchResultOverlay = $('.search-result-overlay', entry);

      const description = $('.search-result-description', entry);
      Object.assign(description, {
        textContent: userstyleSearchResult.description.replace(/<.*?>/g, '').replace(/(\r\n?)\r\n?/g, '$1')
      });
      const descriptionExpand = $('.search-result-description-info', entry);
      Object.assign(descriptionExpand, {
        onclick: e => {
          e.stopPropagation();
          descriptionExpand.classList.add('hidden');
          description.classList.add('expanded');
        }
      });

      const authorLink = $('.search-result-author-link', entry);
      Object.assign(authorLink, {
        textContent: userstyleSearchResult.user.name,
        title: userstyleSearchResult.user.name,
        href: searchAPI.BASE_URL + '/users/' + userstyleSearchResult.user.id,
        onclick: event => {
          event.stopPropagation();
          handleEvent.openURLandHide.call(authorLink, event);
        }
      });

      const rating = $('.search-result-rating', entry);
      let ratingClass;
      let ratingValue = userstyleSearchResult.rating;
      if (ratingValue === null) {
        ratingClass = 'none';
        ratingValue = 'n/a';
      } else if (ratingValue >= 2.5) {
        ratingClass = 'good';
        ratingValue = ratingValue.toFixed(1);
      } else if (ratingValue >= 1.5) {
        ratingClass = 'okay';
        ratingValue = ratingValue.toFixed(1);
      } else {
        ratingClass = 'bad';
        ratingValue = ratingValue.toFixed(1);
      }
      Object.assign(rating, {
        textContent: ratingValue,
        className: 'search-result-rating ' + ratingClass
      });

      const installCount = $('.search-result-install-count', entry);
      Object.assign(installCount, {
        textContent: userstyleSearchResult.total_install_count.toLocaleString()
      });

      const uninstallButton = $('.search-result-uninstall', entry);
      uninstallButton.onclick = uninstall;

      const installButton = $('.search-result-install', entry);
      installButton.onclick = install;

      if (userstyleSearchResult.style_settings.length > 0) {
        // Style has customizations
        installButton.classList.add('customize');
        uninstallButton.classList.add('customize');

        const customizeButton = $('.search-result-customize', entry);
        customizeButton.dataset.href = searchAPI.BASE_URL + userstyleSearchResult.url;
        customizeButton.classList.remove('hidden');
        customizeButton.onclick = event => {
          event.stopPropagation();
          handleEvent.openURLandHide.call(customizeButton, event);
        };
      }

      if (userstyleSearchResult.installed) {
        screenshot.onclick = uninstall;
        searchResultOverlay.onclick = uninstall;
        installButton.classList.add('hidden');
        uninstallButton.classList.remove('hidden');
      } else {
        screenshot.onclick = install;
        searchResultOverlay.onclick = install;
      }

      /** Uninstalls the current userstyleSearchResult from Stylus. */
      function uninstall(event) {
        event.stopPropagation();
        deleteStyleSafe({id: userstyleSearchResult.installedStyleId})
          .then(() => {
            userstyleSearchResult.installed = false;
            render();
          });
      }

      /** Installs the current userstyleSearchResult into Stylus. */
      function install(event) {
        if (event) {
          event.stopPropagation();
        }

        // Spinner while installing
        entry.appendChild(
          $create(
            '.lds-spinner',
            new Array(12).fill($create('div')).map(e => e.cloneNode()))
        );
        installButton.disabled = true;

        // Fetch .JSON style
        searchAPI.fetchStyleJson(userstyleSearchResult)
          .then(userstyleJson => {
            // Install style
            saveStyleSafe(userstyleJson)
              .then(savedStyle => {
                // Success: Store installed styleId, mark as installed.
                userstyleSearchResult.installed = true;
                userstyleSearchResult.installedStyleId = savedStyle.id;
                render(); // Hides install button, shows uninstall button.

                $.remove('.lds-spinner', entry);
                installButton.disabled = false;
              });
          })
          .catch(reason => {
            const usoId = userstyleSearchResult.id;
            console.log('install:saveStyleSafe(usoID:', usoId, ') => [ERROR]: ', reason);
            alert('Error while downloading usoID:' + usoId + '\nReason: ' + reason);

            $.remove('.lds-spinner', entry);
            installButton.disabled = false;
          });
        return true;
      }

    } // End of createSearchResultNode
  } // End of searchResultsController
})();

/**
 * Library for interacting with userstyles.org
 * @returns {Object} Exposed methods representing the search results on userstyles.org
 */
function searchUserstyles() {
  const BASE_URL = 'https://userstyles.org';
  let totalPages;
  let currentPage = 1;
  let exhausted = false;

  return {BASE_URL, getCategory, getSearchPageURL, isExhausted, search, fetchStyleJson, fetchStyle};

  /**
   * @returns {Boolean} If there are no more results to fetch from userstyles.org
   */
  function isExhausted() {
    return exhausted;
  }

  function getSearchPageURL(url) {
    const category = getCategory(url);
    if (category === 'STYLUS') {
      return BASE_URL + '/styles/browse/?search_terms=Stylus';
    } else {
      return BASE_URL + '/styles/browse/' + category;
    }
  }

  /**
   * Resolves the Userstyles.org "category" for a given URL.
   * @param {String} url The URL to a webpage.
   * @returns {Promise<String>} The category for a URL, or the hostname if category is not found.
   */
  function getCategory(url) {
    const u = tryCatch(() => new URL(url));
    if (!u) {
      return ''; // Invalid URL
    } else if (u.protocol === 'file:') {
      return 'file:'; // File page
    } else if (u.protocol === location.protocol) {
      return 'STYLUS'; // Stylus page
    } else {
      // Website address, strip TLD & subdomain
      let domain = u.hostname.replace(/^www\.|(\.com?)?\.\w+$/g, '').split('.').pop();
      if (domain === 'userstyles') {
        domain = 'userstyles.org';
      }
      return domain;
    }
  }

  /**
   * Fetches the JSON style object from userstyles.org (containing code, sections, updateUrl, etc).
   * Stores (caches) the JSON within the given usoSearchResult, to avoid unnecessary network usage.
   * Style JSON is fetched from the /styles/chrome/{id}.json endpoint.
   * @param {Object} usoSearchResult A search result object from userstyles.org
   * @returns {Promise<Object>} Promises the response as a JSON object.
   */
  function fetchStyleJson(usoSearchResult) {
    return new Promise((resolve, reject) => {
      if (usoSearchResult.json) {
        // JSON already downloaded & stored.
        resolve(usoSearchResult.json);
      }

      const jsonUrl = BASE_URL + '/styles/chrome/' + usoSearchResult.id + '.json';
      download(jsonUrl)
        .then(responseText => {
          // Store JSON within the search result, so we don't have to download again.
          usoSearchResult.json = tryJSONparse(responseText);
          resolve(usoSearchResult.json);
        })
        .catch(reject);
    });
  }

  /**
   * Fetches style information from userstyles.org's /api/v1/styles/{ID} API.
   * @param {number} userstylesId The internal "ID" for a style on userstyles.org
   * @returns {Promise<Object>} An object containing info about the style, e.g. name, author, etc.
   */
  function fetchStyle(userstylesId) {
    return new Promise((resolve, reject) => {
      download(BASE_URL + '/api/v1/styles/' + userstylesId, {
        method: 'GET',
        headers: {
          'Content-type': 'application/json',
          'Accept': '*/*'
        },
        body: null
      }).then(responseText => {
        resolve(tryJSONparse(responseText));
      }).catch(reject);
    });
  }

  /**
   * Fetches (and JSON-parses) search results from a userstyles.org search API.
   * Automatically sets currentPage and totalPages.
   * @param {string} category The usrestyles.org "category" (subcategory) OR a any search string.
   * @return {Object} Response object from userstyles.org
   */
  function search(category) {
    return new Promise((resolve, reject) => {
      if (totalPages !== undefined && currentPage > totalPages) {
        resolve({'data':[]});
      }

      const searchURL = BASE_URL +
        '/api/v1/styles/subcategory' +
        '?search=' + encodeURIComponent(category) +
        '&page=' + currentPage +
        '&country=NA';

      download(searchURL, {
        method: 'GET',
        headers: {
          'Content-type': 'application/json',
          'Accept': '*/*'
        },
        body: null
      }).then(responseText => {
        const responseJson = tryJSONparse(responseText);
        currentPage = responseJson.current_page + 1;
        totalPages = responseJson.total_pages;
        exhausted = (currentPage > totalPages);
        resolve(responseJson);
      }).catch(reason => {
        exhausted = true;
        reject(reason);
      });
    });
  }
}
