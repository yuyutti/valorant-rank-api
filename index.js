require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rankList = require('./ranklist');

const app = express();

const config = {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    ValorantAPIKey: process.env.VALORANT_API_KEY || null,
    googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID || '',
    googleAnalyticsApiSecret: process.env.GOOGLE_ANALYTICS_API_SECRET || '',
    googleAnalyticsHashSecret: process.env.GOOGLE_ANALYTICS_HASH_SECRET || process.env.GOOGLE_ANALYTICS_API_SECRET || '',
};

app.get('/', (req, res) => {
    res.send(renderStaticPage('index.html'));
});

app.get('/privacy', (req, res) => {
    res.send(renderStaticPage('privacy.html'));
});

app.get('/api/info/:name/:tag', async (req, res) => {
    const riotId = {
        name: `${req.params.name}#${req.params.tag}`,
    };
    const riotUserInfo = await getRiotUserInfo(riotId);
    const analyticsParams = buildApiInfoAnalyticsParams(req, riotUserInfo);

    if (riotUserInfo.error) {
        sendGoogleAnalyticsEvent(req, 'page_view', analyticsParams);
        return res.status(riotUserInfo.status || 500).json(riotUserInfo);
    }

    sendGoogleAnalyticsEvent(req, 'page_view', analyticsParams);
    return res.json(riotUserInfo);
});

app.get('/img/rank/:rank', (req, res) => {
    const rankInfo = getRankInfo(req.params.rank);
    const imgPath = path.join(__dirname, rankInfo.img);
    const img = fs.readFileSync(imgPath);

    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(img, 'binary');
});

app.get('/img/main', (req, res) => {
    const imgPath = path.join(__dirname, 'img', 'picture', 'mainimg.png');
    const img = fs.readFileSync(imgPath);

    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(img, 'binary');
});

function getRankInfo(tier) {
    return rankList[tier] || rankList[1];
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function getRiotIdHash(name, tag) {
    const normalizedRiotId = `${name.trim().toLowerCase()}#${tag.trim().toLowerCase()}`;

    return getAnalyticsKey(normalizedRiotId);
}

function getAnalyticsKey(value) {
    if (!config.googleAnalyticsHashSecret) {
        return sha256(value);
    }

    return crypto
        .createHmac('sha256', config.googleAnalyticsHashSecret)
        .update(value)
        .digest('hex');
}

function getRequestIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];

    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }

    return req.socket.remoteAddress || '';
}

function getGoogleAnalyticsClientId(req) {
    const gaCookie = req.headers.cookie?.match(/(?:^|;\s*)_ga=GA\d+\.\d+\.(\d+\.\d+)/);

    if (gaCookie) {
        return gaCookie[1];
    }

    const requestHash = sha256(`${getRequestIp(req)}|${req.headers['user-agent'] || ''}`);
    const first = Number.parseInt(requestHash.slice(0, 12), 16) % 10000000000;
    const second = Number.parseInt(requestHash.slice(12, 24), 16) % 10000000000;

    return `${first}.${second}`;
}

function getRequestSource(req) {
    if (req.headers.accept?.includes('text/html')) {
        return 'browser';
    }

    if (req.headers['user-agent']) {
        return 'api_client';
    }

    return 'unknown';
}

function getRequestOrigin(req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `${config.host}:${config.port}`;

    return `${protocol}://${host}`;
}

function buildApiInfoAnalyticsParams(req, riotUserInfo) {
    const name = req.params.name || '';
    const tag = req.params.tag || '';
    const success = !riotUserInfo.error;
    const apiPath = `/api/info/${name}/${tag}`;

    return {
        api_path: `/api/info/:name/:tag`,
        api_full_path: apiPath,
        page_location: `${getRequestOrigin(req)}${apiPath}`,
        page_title: 'VALORANT Rank API Info',
        request_source: getRequestSource(req),
        success: success ? 1 : 0,
        status: riotUserInfo.status || 200,
        riot_id_key: getRiotIdHash(name, tag),
        account_key: riotUserInfo.puuid ? getAnalyticsKey(riotUserInfo.puuid) : '',
        current_tier: riotUserInfo.currentTia || 0,
        current_rank_ja: riotUserInfo.currentRank?.ja || '',
        current_rank_en: riotUserInfo.currentRank?.en || '',
        rank_points: riotUserInfo.points || 0,
        mmr_change_to_last_game: riotUserInfo.mmr_change_to_last_game || 0,
        total_points: riotUserInfo.totalPoints || 0,
        account_level: riotUserInfo.account_level || 0,
        shard: riotUserInfo.shared || '',
        has_card: riotUserInfo.card ? 1 : 0,
        error_type: riotUserInfo.error ? String(riotUserInfo.error).slice(0, 100) : '',
    };
}

async function sendGoogleAnalyticsEvent(req, eventName, params) {
    if (!config.googleAnalyticsId || !config.googleAnalyticsApiSecret) {
        return;
    }

    const url = new URL('https://www.google-analytics.com/mp/collect');

    url.searchParams.set('measurement_id', config.googleAnalyticsId);
    url.searchParams.set('api_secret', config.googleAnalyticsApiSecret);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: getGoogleAnalyticsClientId(req),
                events: [
                    {
                        name: eventName,
                        params: {
                            ...params,
                            engagement_time_msec: 1,
                        },
                    },
                ],
            }),
        });

        if (!response.ok) {
            console.error('Google Analytics Measurement Protocol failed:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('Google Analytics Measurement Protocol error:', error);
    }
}

function getGoogleAnalyticsTag() {
    if (!/^G-[A-Z0-9]+$/i.test(config.googleAnalyticsId)) {
        return '';
    }

    return `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${config.googleAnalyticsId}"></script>
    <script>
        window.dataLayer = window.dataLayer || [];

        function gtag() {
            dataLayer.push(arguments);
        }

        gtag('js', new Date());
        gtag('config', '${config.googleAnalyticsId}', {
            page_location: window.location.origin + window.location.pathname,
            allow_google_signals: false,
            allow_ad_personalization_signals: false
        });
    </script>`;
}

function renderStaticPage(filename) {
    const pagePath = path.join(__dirname, 'public', filename);
    const html = fs.readFileSync(pagePath, 'utf8');

    return html.replace('<!-- GOOGLE_ANALYTICS -->', getGoogleAnalyticsTag());
}

function getCurrentMmrData(mmr) {
    return mmr.data.current_data || mmr.data;
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            Authorization: config.ValorantAPIKey,
        },
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = body.errors?.[0]?.message || body.message || response.statusText;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return body;
}

async function getRiotUserInfo(riotGames) {
    try {
        if (!config.ValorantAPIKey) {
            const error = new Error('VALORANT_API_KEY is not set');
            error.status = 500;
            throw error;
        }

        const [name, tagLine] = riotGames.name.split('#');
        const encodedName = encodeURIComponent(name);
        const encodedTagLine = encodeURIComponent(tagLine);

        const accountInfo = await fetchJson(`https://api.henrikdev.xyz/valorant/v1/account/${encodedName}/${encodedTagLine}`);
        const activeShard = accountInfo.data.region;
        const mmr = await fetchJson(`https://api.henrikdev.xyz/valorant/v2/mmr/${activeShard}/${encodedName}/${encodedTagLine}`);
        const currentMmr = getCurrentMmrData(mmr);
        const rankInfo = getRankInfo(currentMmr.currenttier);

        return {
            puuid: accountInfo.data.puuid,
            gameName: accountInfo.data.name,
            tagLine: accountInfo.data.tag,
            card: accountInfo.data.card,
            shared: accountInfo.data.region,
            account_level: accountInfo.data.account_level,
            currentTia: currentMmr.currenttier || 1,
            points: currentMmr.ranking_in_tier || 0,
            currentRank: {
                ja: rankInfo.ja,
                en: rankInfo.en,
            },
            currentRankImgSrc: rankInfo.url,
            mmr_change_to_last_game: currentMmr.mmr_change_to_last_game || 0,
            totalPoints: currentMmr.elo || 0,
        };
    } catch (error) {
        console.error('Error fetching Riot user info:', error);
        return {
            error: error.message,
            status: error.status || 500,
        };
    }
}

app.listen(config.port, () => {
    console.log(`Example app listening on port ${config.port}!`);
});
