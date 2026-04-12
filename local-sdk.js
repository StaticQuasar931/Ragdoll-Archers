(() => {
  "use strict";

  const listeners = {
    auth: new Set(),
    settings: new Set(),
    joinRoom: new Set(),
    adblockPopup: new Set(),
  };
  const LOCAL_GAME_ID = "local";
  const LOCAL_STORAGE_KEY = `SDK_DATA_${LOCAL_GAME_ID}`;

  const logger = {
    log: (...args) => console.log("[Local CrazySDK]", ...args),
    warn: (...args) => console.warn("[Local CrazySDK]", ...args),
    error: (...args) => console.error("[Local CrazySDK]", ...args),
  };

  const demoUser = {
    __dangerousUserId: "local-user",
    username: "Player",
    profilePictureUrl: "",
  };

  function safeCall(fn, ...args) {
    try {
      return fn(...args);
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  function makeInviteUrl(params = {}) {
    const url = new URL(window.location.href);
    url.searchParams.set("czy_invite", "true");
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  function readWrappedData() {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.data && typeof parsed.data === "object") {
        return parsed.data;
      }
    } catch (error) {
      logger.warn("Failed to read local SDK data", error);
    }
    return {};
  }

  function writeWrappedData(data) {
    try {
      const wrapped = {
        data,
        metadata: {
          date: new Date().toISOString(),
        },
      };
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(wrapped));
    } catch (error) {
      logger.error("Failed to persist local SDK data", error);
    }
  }

  const sdk = {
    environment: "local",
    isQaTool: false,
    _initialized: false,
    _adPlaying: false,
    _user: demoUser,
    _settings: {
      disableChat: false,
      muteAudio: false,
    },

    async init(options = {}) {
      this._initialized = true;
      logger.log("init", options);
      return this;
    },

    get instance() {
      return this;
    },

    get ad() {
      return {
        prefetchAd(type) {
          logger.log("prefetchAd", type);
        },
        requestAd: async (type, callbacks = {}) => {
          if (sdk._adPlaying) {
            safeCall(callbacks.adError || callbacks.adFinished || (() => {}), new Error("Ad already playing"));
            return;
          }

          sdk._adPlaying = true;
          safeCall(callbacks.adStarted || (() => {}));
          logger.log("requestAd", type);

          setTimeout(() => {
            sdk._adPlaying = false;
            safeCall(callbacks.adFinished || (() => {}));
          }, 500);
        },
        async hasAdblock() {
          return false;
        },
        addAdblockPopupListener(listener) {
          listeners.adblockPopup.add(listener);
        },
        removeAdblockPopupListener(listener) {
          listeners.adblockPopup.delete(listener);
        },
        get isAdPlaying() {
          return sdk._adPlaying;
        },
      };
    },

    get banner() {
      return {
        activeBannersCount: 0,
        async prefetchBanner(request) {
          logger.log("prefetchBanner", request);
          return { id: request.id, banner: request, renderOptions: {} };
        },
        async requestBanner(request) {
          logger.log("requestBanner", request);
          return;
        },
        async prefetchResponsiveBanner(idOrRequest) {
          logger.log("prefetchResponsiveBanner", idOrRequest);
          return { id: typeof idOrRequest === "string" ? idOrRequest : idOrRequest.id, renderOptions: {} };
        },
        async requestResponsiveBanner(id) {
          logger.log("requestResponsiveBanner", id);
          return;
        },
        async renderPrefetchedBanner(data) {
          logger.log("renderPrefetchedBanner", data);
          return;
        },
        clearBanner(id) {
          logger.log("clearBanner", id);
        },
        clearAllBanners() {
          logger.log("clearAllBanners");
        },
        requestOverlayBanners(requests) {
          logger.log("requestOverlayBanners", requests);
        },
      };
    },

    get game() {
      return {
        link: window.location.href,
        id: LOCAL_GAME_ID,
        isInstantJoin: window.location.search.includes("instantJoin=true"),
        isInstantMultiplayer: window.location.search.includes("instantJoin=true"),
        inviteParams: null,
        settings: sdk._settings,
        happytime() {
          logger.log("happytime");
        },
        gameplayStart() {
          logger.log("gameplayStart");
        },
        gameplayStop() {
          logger.log("gameplayStop");
        },
        loadingStart() {
          logger.log("loadingStart");
        },
        loadingStop() {
          logger.log("loadingStop");
        },
        inviteLink(params) {
          const url = makeInviteUrl(params);
          logger.log("inviteLink", url);
          return url;
        },
        showInviteButton(params) {
          const url = makeInviteUrl(params);
          logger.log("showInviteButton", url);
          return url;
        },
        hideInviteButton() {
          logger.log("hideInviteButton");
        },
        getInviteParam(name) {
          return new URLSearchParams(window.location.search).get(name);
        },
        addSettingsChangeListener(listener) {
          listeners.settings.add(listener);
        },
        removeSettingsChangeListener(listener) {
          listeners.settings.delete(listener);
        },
        addJoinRoomListener(listener) {
          listeners.joinRoom.add(listener);
        },
        removeJoinRoomListener(listener) {
          listeners.joinRoom.delete(listener);
        },
        updateRoom(data) {
          logger.log("updateRoom", data);
        },
        leftRoom() {
          logger.log("leftRoom");
        },
      };
    },

    get user() {
      return {
        isUserAccountAvailable: true,
        systemInfo: {
          browser: { name: navigator.userAgent, version: "" },
          countryCode: "US",
          locale: navigator.language || "en-US",
          os: { name: "web", version: "" },
          device: { type: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "mobile" : "desktop" },
          applicationType: "web",
        },
        async showAuthPrompt() {
          logger.log("showAuthPrompt");
          return sdk._user;
        },
        async showAccountLinkPrompt() {
          logger.log("showAccountLinkPrompt");
          return { response: "yes" };
        },
        async getUser() {
          return sdk._user;
        },
        addAuthListener(listener) {
          listeners.auth.add(listener);
        },
        removeAuthListener(listener) {
          listeners.auth.delete(listener);
        },
        async getUserToken() {
          return "local-token";
        },
        async getXsollaUserToken() {
          return "local-xsolla-token";
        },
        submitScore(score) {
          logger.log("submitScore", score);
        },
        addScore(score) {
          logger.log("addScore", score);
        },
        addScoreEncrypted(score) {
          logger.log("addScoreEncrypted", score);
        },
        async listFriends() {
          return { friends: [], page: 1, size: 0, hasMore: false, total: 0 };
        },
      };
    },

    get data() {
      return {
        clear() {
          writeWrappedData({});
        },
        getItem(key) {
          const data = readWrappedData();
          return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        },
        removeItem(key) {
          const data = readWrappedData();
          delete data[key];
          writeWrappedData(data);
        },
        setItem(key, value) {
          const data = readWrappedData();
          data[key] = String(value);
          writeWrappedData(data);
        },
        syncUnityGameData() {
          logger.log("syncUnityGameData");
        },
      };
    },

    get analytics() {
      return {
        trackOrder(provider, order) {
          logger.log("trackOrder", provider, order);
        },
      };
    },
  };

  window.CrazyGames = { SDK: sdk };
  window.CrazySDK = sdk;
  window.CrazySDKSingleton = sdk;
})();
