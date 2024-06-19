require('dotenv').config();
const express = require('express');
const app = express();

const fs = require('fs');

const rankList = require('./ranklist');

const config = {
    port: process.env.PORT || 3000,
    openPort: process.env.OPEN_PORT || 433,
    host: process.env.HOST || 'localhost',
    ValorantAPIKey: process.env.VALORANT_API_KEY || null,
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/api/info/:name/:tag', async (req, res) => { // ユーザー情報を取得
    const name = req.params.name;
    const tag = req.params.tag;
    const RiotID = {
        name: `${name}#${tag}`,
    }
    const riotUserInfo = await getRiotUserInfo(RiotID);

    return res.json(riotUserInfo);
});

app.get('/img/rank/:rank', (req, res) => { // ランクの画像を取得
    const rank = req.params.rank;
    const imgPath = rankList[rank].img;
    const img = fs.readFileSync(imgPath);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(img, 'binary');
});

app.get(`/img/main`, (req, res) => { // メイン画像を取得
    const imgPath = './img/picture/mainimg.png';
    const img = fs.readFileSync(imgPath);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(img, 'binary');
});

async function getRiotUserInfo(riotGames) { // Riotのユーザー情報を取得
    try {
        const [name, tagLine] = riotGames.name.split("#");

        const response_accountInfo = await fetch(`https://api.henrikdev.xyz/valorant/v1/account/${name}/${tagLine}`, {
            headers: {
                "Authorization": config.ValorantAPIKey
            }
        });

        if (!response_accountInfo.ok) {
            throw new Error(`Account info fetch failed: ${response_accountInfo.statusText}`);
        }

        const accountInfo = await response_accountInfo.json();
        const activeShard = accountInfo.data.region;

        const response_MMR = await fetch(`https://api.henrikdev.xyz/valorant/v1/mmr/${activeShard}/${name}/${tagLine}`, {
            headers: {
                "Authorization": config.ValorantAPIKey
            }
        });

        if (!response_MMR.ok) {
            throw new Error(`MMR info fetch failed: ${response_MMR.statusText}`);
        }

        const MMR = await response_MMR.json();
        if (MMR.data.old) {
            const responseData = {
                puuid: accountInfo.data.puuid,
                gameName: accountInfo.data.name,
                tagLine: accountInfo.data.tag,
                card: accountInfo.data.card,
                shared: accountInfo.data.region,
                account_level: accountInfo.data.account_level
            }
            return responseData;
        } else {
            const responseData = {
                puuid: accountInfo.data.puuid,
                gameName: accountInfo.data.name,
                tagLine: accountInfo.data.tag,
                card: accountInfo.data.card,
                shared: accountInfo.data.region,
                account_level: accountInfo.data.account_level,
                currentTia: MMR.data.currenttier,
                points: MMR.data.ranking_in_tier || 0,
                currentRank: {
                    ja: rankList[MMR.data.currenttier].ja,
                    en: rankList[MMR.data.currenttier].en,
                },
                currentRankImg: `http://${config.host}:${config.port}${rankList[MMR.data.currenttier].url}`,
                mmr_change_to_last_game: MMR.data.mmr_change_to_last_game,
                totalPoints: MMR.data.elo
            }
            return responseData;
        }
    } catch (error) {
        console.error('Error fetching Riot user info:', error);
        return { error: error.message };
    }
}

app.listen(config.port, () => {
    console.log('Example app listening on port 3000!');
});