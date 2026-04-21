/**
 * Media Management ORM Example
 * 
 * Demonstrates a complex media system (Series -> Seasons -> Episodes)
 * with metrics like views, ratings, and rankings.
 */

import { Database } from "../index";
import {
    sqliteTable,
    integer,
    text,
    real,
    index,
    sqliteNapi,
    type InferRow,
} from "./core/index";

// ============================================
// 1. Schema Definition
// ============================================

// Base Media (Series/Movies)
const media = sqliteTable("media", {
    id: integer("id").primaryKey().autoincrement(),
    title: text("title").notNull(),
    type: text("type").notNull().default("series"), // 'series' or 'movie'
    rating: real("rating").notNull().default(0),
    views: integer("views").notNull().default(0),
    ranking: integer("ranking").notNull().default(0),
    createdAt: text("created_at").notNull().default("(CURRENT_TIMESTAMP)"),
}, (table) => ({
    rankingIdx: index("media_ranking_idx", [table.ranking.name]),
    viewsIdx: index("media_views_idx", [table.views.name]),
}));

// Seasons
const seasons = sqliteTable("seasons", {
    id: integer("id").primaryKey().autoincrement(),
    mediaId: integer("media_id").notNull().references("media", "id"),
    seasonNumber: integer("season_number").notNull(),
    title: text("title"),
    rating: real("rating").notNull().default(0),
    views: integer("views").notNull().default(0),
    ranking: integer("ranking").notNull().default(0),
}, (table) => ({
    mediaSeasonIdx: index("media_season_idx", [table.mediaId.name, table.seasonNumber.name]),
    rankingIdx: index("season_ranking_idx", [table.ranking.name]),
}));

// Episodes
const episodes = sqliteTable("episodes", {
    id: integer("id").primaryKey().autoincrement(),
    seasonId: integer("season_id").notNull().references("seasons", "id"),
    episodeNumber: integer("episode_number").notNull(),
    title: text("title").notNull(),
    rating: real("rating").notNull().default(0),
    views: integer("views").notNull().default(0),
    ranking: integer("ranking").notNull().default(0),
    duration: integer("duration"), // in seconds
}, (table) => ({
    seasonEpisodeIdx: index("season_episode_idx", [table.seasonId.name, table.episodeNumber.name]),
    rankingIdx: index("episode_ranking_idx", [table.ranking.name]),
}));

export type Media = InferRow<typeof media>;
export type Season = InferRow<typeof seasons>;
export type Episode = InferRow<typeof episodes>;

// ============================================
// 2. Media Service
// ============================================

class MediaService {
    public adapter: ReturnType<typeof sqliteNapi>;

    constructor(db: Database) {
        this.adapter = sqliteNapi(db);
        this.adapter.sync([media, seasons, episodes]);
    }

    // --- Metrics Updaters ---

    incrementViews(type: 'media' | 'season' | 'episode', id: number) {
        const table = type === 'media' ? media : type === 'season' ? seasons : episodes;
        // In a real ORM we might want to use a raw SQL expression like views = views + 1
        // For now we'll do a get-then-set or use raw SQL via execute
        this.adapter.execute(`UPDATE ${table.name} SET views = views + 1 WHERE id = ?`, [id]);
    }

    updateRating(type: 'media' | 'season' | 'episode', id: number, newRating: number) {
        // Ensure rating is between 1 and 10
        const rating = Math.max(1, Math.min(10, newRating));

        const table = type === 'media' ? media : type === 'season' ? seasons : episodes;
        this.adapter.update(table).set({ rating }).where("id = ?", [id]).run();
    }

    updateRanking(type: 'media' | 'season' | 'episode', id: number, newRanking: number) {
        const table = type === 'media' ? media : type === 'season' ? seasons : episodes;
        this.adapter.update(table).set({ ranking: newRanking }).where("id = ?", [id]).run();
    }

    /**
     * Automatically recalculate ranking based on views and rating
     * Formula: (views + 1) * rating
     */
    recalculateRanking(type: 'media' | 'season' | 'episode', id: number) {
        const table = type === 'media' ? media : type === 'season' ? seasons : episodes;
        this.adapter.execute(
            `UPDATE ${table.name} SET ranking = CAST((views + 1) * rating AS INTEGER) WHERE id = ?`,
            [id]
        );
    }

    // --- Aggregation Queries ---

    /**
     * Get the average rating of all seasons for a media item
     */
    getAverageMediaRating(mediaId: number): number {
        const sql = `SELECT AVG(rating) as avg_rating FROM seasons WHERE media_id = ?`;
        const res = this.adapter.query<{ avg_rating: number }>(sql).get([mediaId]);
        return res?.avg_rating || 0;
    }

    /**
     * Get the average rating of all episodes for a season
     */
    getAverageSeasonRating(seasonId: number): number {
        const sql = `SELECT AVG(rating) as avg_rating FROM episodes WHERE season_id = ?`;
        const res = this.adapter.query<{ avg_rating: number }>(sql).get([seasonId]);
        return res?.avg_rating || 0;
    }

    // --- Top Ranking Queries ---

    getTopMedia(limit: number = 10, by: 'ranking' | 'rating' = 'ranking') {
        return this.adapter.select(media)
            .orderBy(by, "desc")
            .limit(limit)
            .all();
    }

    getTopSeasons(limit: number = 10, by: 'ranking' | 'rating' = 'ranking') {
        return this.adapter.select(seasons)
            .orderBy(by, "desc")
            .limit(limit)
            .all();
    }

    getTopEpisodes(limit: number = 10, by: 'ranking' | 'rating' = 'ranking') {
        return this.adapter.select(episodes)
            .orderBy(by, "desc")
            .limit(limit)
            .all();
    }

    // --- Complex Relations ---

    getMediaWithStats(mediaId: number) {
        const m = this.adapter.select(media).where("id = ?", [mediaId]).get();
        if (!m) return null;

        const s = this.adapter.select(seasons).where("media_id = ?", [mediaId]).orderBy("season_number").all();

        return {
            ...m,
            seasons: s
        };
    }

    // --- Initialization Helper ---

    createSeries(title: string, seasonCount: number, episodesPerSeason: number) {
        return this.adapter.transaction((tx) => {
            const mediaRes = tx.insert(media).values({ title, type: "series" }).run();
            const mediaId = Number(mediaRes.lastInsertRowid);

            for (let s = 1; s <= seasonCount; s++) {
                const seasonRes = tx.insert(seasons).values({
                    mediaId,
                    seasonNumber: s,
                    title: `Season ${s}`
                }).run();
                const seasonId = Number(seasonRes.lastInsertRowid);

                for (let e = 1; e <= episodesPerSeason; e++) {
                    tx.insert(episodes).values({
                        seasonId,
                        episodeNumber: e,
                        title: `Episode ${e} of S${s}`,
                        duration: 1200 + Math.random() * 600
                    }).run();
                }
            }
            return mediaId;
        });
    }
}

// ============================================
// 3. Execution
// ============================================

async function main() {
    console.log("\x1b[35m=== Media System ORM Demo ===\x1b[0m\n");

    const db = new Database(":memory:");
    const service = new MediaService(db);

    console.log("1. Creating Media Library...");
    service.createSeries("The NAPI Chronicles", 2, 5);
    service.createSeries("SQLite Adventures", 1, 3);
    service.createSeries("Binary Dreams", 3, 4);
    service.createSeries("Node.js Knight", 2, 8);
    service.createSeries("Async Assassin", 1, 10);
    service.createSeries("Buffer Boy", 4, 2);
    service.createSeries("Stream Samurai", 2, 6);
    service.createSeries("Promise Paladin", 1, 12);
    service.createSeries("Event Loop Hero", 3, 5);
    service.createSeries("Micro-benchmark Mage", 2, 4);
    service.createSeries("Native Nuisance", 1, 3);
    console.log(`   ✓ Library created with 11 series.\n`);

    console.log("2. Simulating User Activity...");
    // Update some media with random ratings and views
    const allMedia = service.adapter.select(media).all();
    allMedia.forEach((m, i) => {
        const r = 5 + Math.random() * 5;
        service.updateRating('media', m.id, r);
        for (let v = 0; v < (i * 10); v++) service.incrementViews('media', m.id);
        service.recalculateRanking('media', m.id);
    });

    console.log("   ✓ Metrics updated.\n");

    console.log("3. Querying Insights...");

    console.log("\n\x1b[32m--- TOP 10 BY RANKING (Popularity) ---\x1b[0m");
    const topRanking = service.getTopMedia(10, 'ranking');
    topRanking.forEach((m, i) => {
        console.log(`   ${i + 1}. [Rank ${m.ranking.toString().padStart(3)}] ${m.title.padEnd(25)} (${m.views} views, ${m.rating.toFixed(1)} rating)`);
    });

    console.log("\n\x1b[32m--- TOP 10 BY RATING (Quality) ---\x1b[0m");
    const topRating = service.getTopMedia(10, 'rating');
    topRating.forEach((m, i) => {
        console.log(`   ${i + 1}. [Rate ${m.rating.toFixed(2)}] ${m.title.padEnd(25)} (${m.ranking} ranking score)`);
    });

    console.log("\n4. Deep Retrieval...");
    const firstMediaId = allMedia[0].id;
    const fullData = service.getMediaWithStats(firstMediaId);
    console.log(`   Series: ${fullData?.title}`);
    console.log(`   Seasons: ${fullData?.seasons.length}`);
    fullData?.seasons.forEach(s => {
        console.log(`    - S${s.seasonNumber}: Rating ${s.rating}, Ranking ${s.ranking}`);
    });

    db.close();
    console.log("\n\x1b[35m✓ end\x1b[0m");
}

main().catch(console.error);
