/* eslint-disable-next-line import/no-unresolved */
const { requireTaskPool } = require('electron-remote');
const listeners = require('../../notifier');
const events = require('../../events');
const settings = require('../settings-manager');
const antibanner = require('../antibanner');
const whitelist = require('../whitelist');
const log = require('../utils/log');
const concurrent = require('../utils/concurrent');
const { groupRules, rulesGroupsBundles, filterGroupsBundles } = require('./rule-groups');

/**
 * Safari Content Blocker Adapter
 *
 * @type {{updateContentBlocker}}
 */
module.exports = (function () {
    const RULES_LIMIT = 50000;
    const DEBOUNCE_PERIOD = 500;

    /**
     * Load content blocker
     */
    const updateContentBlocker = () => {

        loadRules(async rules => {

            const grouped = groupRules(rules);
            let overlimit = false;

            for (let group of grouped) {
                const rulesTexts = group.rules.map(x => x.ruleText);
                const rulesCount = rulesTexts.length;
                const bundleId = rulesGroupsBundles[group.key];

                if (!overlimit) {
                    overlimit = rulesCount > RULES_LIMIT;
                }

                const info = {
                    rulesCount: rulesCount,
                    bundleId: bundleId,
                    overlimit: rulesCount > RULES_LIMIT,
                    filterGroups: group.filterGroups,
                    hasError: false,
                };

                setSafariContentBlocker(bundleId, rulesTexts, info);
            }

            setSafariContentBlocker(
                rulesGroupsBundles["advancedBlocking"],
                rules.map(x => x.ruleText),
                { rulesCount: rules.length }
            );

            const rulesWithoutCommentsCount = rules.filter((rule) => !rule.ruleText.startsWith('!')).length;

            // TODO: This info is now ready only after content-blocker set
            listeners.notifyListeners(events.CONTENT_BLOCKER_UPDATED, {
                rulesCount: rulesWithoutCommentsCount,
                // not really reliable, actually the limit is up on json entries count, but not the source rules
                rulesOverLimit: overlimit,
                advancedBlockingRulesCount: rulesWithoutCommentsCount // unknown
            });

        });
    };

    /**
     * Load rules from requestFilter and WhiteListService
     * @private
     */
    const loadRules = concurrent.debounce((callback) => {
        if (settings.isFilteringDisabled()) {
            log.info('Disabling content blocker.');
            callback(null);
            return;
        }

        log.info('Loading content blocker.');

        let rules = antibanner.getRules();

        log.info('Rules loaded: {0}', rules.length);
        if (settings.isDefaultWhiteListMode()) {
            rules = rules.concat(whitelist.getRules().map((r) => {
                return { filterId: 0, ruleText: r };
            }));
        } else {
            const invertedWhitelistRule = constructInvertedWhitelistRule();
            if (invertedWhitelistRule) {
                rules = rules.concat({
                    filterId: 0, ruleText: invertedWhitelistRule,
                });
            }
        }

        callback(rules);
    }, DEBOUNCE_PERIOD);

    /**
     * Sets up rules for bundle
     *
     * @param bundleId
     * @param rulesTexts
     * @param info
     */
    const setSafariContentBlocker = (bundleId, rulesTexts, info) => {
        try {
            log.info(`Setting content blocker json for ${bundleId}. Rules count: ${rulesTexts.length}.`);

            const json = JSON.stringify(rulesTexts);

            listeners.notifyListeners(events.CONTENT_BLOCKER_UPDATE_REQUIRED, {
                bundleId,
                json,
                info,
            });
        } catch (ex) {
            log.error(`Error while setting content blocker ${bundleId}: ${ex}`);
        }
    };

    /**
     * Constructs rule for inverted whitelist
     *
     * @private
     */
    const constructInvertedWhitelistRule = () => {
        const domains = whitelist.getWhiteListDomains();
        let invertedWhitelistRule = '@@||*$document';
        if (domains && domains.length > 0) {
            invertedWhitelistRule += ',domain=';
            let i = 0;
            const len = domains.length;
            for (; i < len; i += 1) {
                if (i > 0) {
                    invertedWhitelistRule += '|';
                }

                invertedWhitelistRule += `~${domains[i]}`;
            }
        }

        return invertedWhitelistRule;
    };

    /**
     * Rules info cache object
     *
     * @type {{}}
     */
    const contentBlockersInfoCache = {};

    /**
     * Saves rules info
     *
     * @param bundleId
     * @param info
     */
    const saveContentBlockerInfo = (bundleId, info) => {
        contentBlockersInfoCache[bundleId] = info;
    };

    /**
     * Returns rules info
     */
    const getContentBlockersInfo = () => {
        const groupsBundles = filterGroupsBundles();
        for (const extension of groupsBundles) {
            extension.rulesInfo = contentBlockersInfoCache[extension.bundleId];
        }

        return groupsBundles;
    };

    // Subscribe to cb extensions update event
    listeners.addListener((event, info) => {
        if (event === events.CONTENT_BLOCKER_EXTENSION_UPDATED) {
            if (info && info.bundleId) {
                saveContentBlockerInfo(info.bundleId, info);
            }
        }
    });

    return {
        updateContentBlocker,
        getContentBlockersInfo,
    };

})();

