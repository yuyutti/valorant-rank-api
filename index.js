require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');

const rankList = require('./ranklist');

const app = express();

const config = {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    ValorantAPIKey: process.env.VALORANT_API_KEY || null,
    googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID || '',
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

    if (riotUserInfo.error) {
        return res.status(riotUserInfo.status || 500).json(riotUserInfo);
    }

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
            page_path: window.location.pathname,
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
