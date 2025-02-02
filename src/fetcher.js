/**
 * fetcher.js
 * Copyright (c) 2018-2021
 *
 * This file contains the Google Apps Script to fetch and upload the media
 * files from the latest available Stories of a Instagram user to your Google
 * Drive.
 *
 * @author Chris K.Y. Fung <github.com/chriskyfung>
 *
 * Created at     : 2018-01-29
 * Last modified  : 2022-11-22
 */

import {
  loadSettings,
  dest,
  igParams,
  isDebug,
  isSettingsLoaded,
} from './init';
import { insertNewLog, loadRecentLogs, isDownloaded } from './logger';
import { uploadToDrive } from './url_to_drive';

/**
 * Compose the URL and the query string to the Instagram's API endpoint.
 * @param {String} igUserID The ID of the target Instagram user to fetch.
 * @return {string} The request URL.
 */
export function getQuery(igUserID) {
  return `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${igUserID}`;
}

/**
 * Fetch data from the Instagram's API with a custom header.
 * @param {String} query The URL and the query string to the API endpoint.
 * @return {Object} The content of an HTTP response encoded as a string.
 */
export function getInstagramData(query) {
  const params = {
    headers: {
      accept: '*/*',
      'accept-language': `zh-HK,zh-TW;q=0.9,zh;q=0.8,en;q=0.7,en-HK;q=0.6,ja-JP;q=0.5,ja;q=0.4,en-US;q=0.3`,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'sec-ch-ua':
        '"Chromium";v="104", " Not A;Brand";v="99", "Google Chrome";v="104"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'x-asbd-id': igParams.X_ASBD_ID,
      'x-csrftoken': igParams.X_CSRFTOKEN,
      'x-ig-app-id': igParams.X_IG_APP_ID,
      'x-ig-www-claim': igParams.X_IG_WWW_CLAIM,
      'x-instagram-ajax': igParams.X_INSTAGRAM_AJAX,
      cookie: igParams.COOKIE,
    },
    referrer: 'https://www.instagram.com/',
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: null,
    method: 'GET',
    mode: 'cors',
  };
  let response;
  try {
    response = UrlFetchApp.fetch(query, params).getContentText();
  } catch (err) {
    const errorMessage = err.message + ' (error code: 0xf1)';
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  if (isDebug) {
    console.log(response);
  }
  try {
    return JSON.parse(response);
  } catch (err) {
    console.error('Failed to parse response (error code: 0xf2):\n' + response);
    throw new Error('Failed to parse response (error code: 0xf2)');
  }
}

/**
 * Resolve the URLs of downloadable media files from a textual HTTP response.
 * @param {Object} data The JSON data retrieved from Instagram API.
 * @return {string[]} The URLs of downloadable media files.
 */
function parseDownloadUrl(data) {
  return (
    data.reels_media[0]?.items.map(
      (item) => (item.video_versions || item.image_versions2.candidates)[0].url
    ) || []
  );
}

/**
 * Test getting the URLs of media files in the data retrieved from Instagram's
 * API using getInstagramData() and parseDownloadUrl().
 * @param {Object} targetIgUser - A JSON object contains the name and id of an
 *  Instagram account, e.g. { "name": "john", "id": "1234567890" }.
 * @return {number} The number of URLs obtained.
 */
export function tryGetStories(targetIgUser) {
  if (!isSettingsLoaded) {
    loadSettings();
  }
  const queryUrl = getQuery(targetIgUser.id);
  const html = getInstagramData(queryUrl);

  const urls = parseDownloadUrl(html, true);
  console.log(
    'Number of downloadable media files from @' +
      targetIgUser.name +
      ': ' +
      urls.length
  );
  return urls.length;
}

/**
 * Main function of this Apps Script.
 * - Insert logs to the Google Sheet that the Apps Script is bounded to.
 * - Fetch data from Instagram's API using getInstagramData().
 * - Resolve the URLs of downloadable media files from the retrieved data
 *   using parseDownloadUrl().
 * - Upload the media files to Google Drive if the URLs are not downloaded.
 * @param {Object} target A JSON object contains the name and the id of an
 *                        Instagram account, for example:
 *                        { "name": "john", "id": "1234567890" }.
 * @return {string} The log messages.
 */
export function fetch(target) {
  // Execute loadSettings() if the settings has not been loaded yet.
  if (!isSettingsLoaded) {
    loadSettings();
  }
  // Get data from Instagram and resolve the media URLs.
  const queryUrl = getQuery(target.id);
  const data = getInstagramData(queryUrl);
  const urls = parseDownloadUrl(data, false);
  // Get recent log data stored in the Google Sheet file.
  let msg = '';
  loadRecentLogs();
  // For each media URL
  if (urls != null && urls.length > 0) {
    urls.forEach((url) => {
      // Remove query strings from the URL.
      const pathname = url.split('.com')[1].split('?')[0];
      // Check if the URL appears in the recent logs.
      if (isDownloaded(pathname)) {
        // Skip processing any downloaded file.
        msg += 'Already been uploaded.\n';
      } else {
        // Upload fresh media file to the destination Google Drive folder
        msg += uploadToDrive(url, dest.folderId, '');
        const currentDatatime = new Date();
        insertNewLog(
          currentDatatime.toLocaleString(), // Datatime string
          target.name, // IG username
          url, // Full URL
          pathname.split('.').pop(), // File extension
          createViewFileFormula(pathname.split('/').pop(), dest.folderId)
        );
      }
    });
  } else {
    msg += 'No media file available.\n';
  }
  return msg;
}

/**
 * Compile a formula to allow clicking the filename to view the file from Drive
 * @param {string} filename
 * @param {string} folderId
 * @return {string}
 */
function createViewFileFormula(filename, folderId) {
  const folder = folderId
    ? DriveApp.getFolderById(folderId)
    : DriveApp.getRootFolder();
  const files = folder.getFilesByName(filename);
  while (files.hasNext()) {
    const file = files.next();
    return `=HYPERLINK("${file.getUrl()}", "${filename}")`;
  }
}
