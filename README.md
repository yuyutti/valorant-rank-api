# valorant-rank-api  

valorant rank API 

``/api/info/:name/:tag``

response json  
```
    puuid: puuid,
    gameName: name,
    tagLine: tag,
    card: {
        "small": "URL",
        "large": "URL",
        "wide": "URL",
        "id": "uuid"
    },
    shared: region,
    account_level: account_level,
    currentTia: currenttier,
    points: ranking_in_tier || 0,
    currentRank: {
        ja: rankList[currenttier].ja,
        en: rankList[currenttier].en,
    },
    currentRankImg: `http://${config.host}:${config.port}${rankList[currenttier].url}`,
    mmr_change_to_last_game: mmr_change_to_last_game,
    totalPoints: elo
```

/  
UI page  
/?name={name}&tagline={tag}  
auto search UI page
