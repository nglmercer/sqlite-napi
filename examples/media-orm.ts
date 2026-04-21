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
    private adapter: ReturnType<typeof sqliteNapi>;

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

    getTopMedia(limit: number = 10) {
        return this.adapter.select(media)
            .orderBy("ranking", "desc")
            .limit(limit)
            .all();
    }

    getTopSeasons(limit: number = 10) {
        return this.adapter.select(seasons)
            .orderBy("ranking", "desc")
            .limit(limit)
            .all();
    }

    getTopEpisodes(limit: number = 10) {
        return this.adapter.select(episodes)
            .orderBy("ranking", "desc")
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

    console.log("1. Creating Series 'The NAPI Chronicles'...");
    const seriesId = service.createSeries("The NAPI Chronicles", 2, 5);
    console.log(`   ✓ Created with ID: ${seriesId}\n`);

    console.log("2. Simulating User Activity...");
    // Increment views for the series
    service.incrementViews('media', seriesId);

    // Update ratings (validated 1-10)
    service.updateRating('media', seriesId, 12); // Will be clamped to 10
    service.updateRanking('media', seriesId, 100);

    // Update seasons with different ratings to check average
    service.updateRating('season', 1, 8);
    service.updateRating('season', 2, 9);

    // Update some episodes
    service.updateRating('episode', 1, 5.0);
    service.updateRanking('episode', 1, 500); // Top episode
    service.updateRanking('episode', 2, 450);

    console.log("   ✓ Metrics updated.\n");

    console.log("3. Querying Top Content...");
    const topMedia = service.getTopMedia(1);
    console.log("   Top Media:", topMedia.map(m => `[Rank ${m.ranking}] ${m.title} (${m.views} views, Rating ${m.rating})`));

    const avgRating = service.getAverageMediaRating(seriesId);
    console.log(`   Average Rating across all seasons: ${avgRating.toFixed(2)} / 10`);

    const topEpisodes = service.getTopEpisodes(3);
    console.log("   Top Episodes:", topEpisodes.map(e => `[Rank ${e.ranking}] ${e.title}`));

    console.log("\n4. Deep Retrieval...");
    const fullData = service.getMediaWithStats(seriesId);
    console.log(`   Series: ${fullData?.title}`);
    console.log(`   Seasons: ${fullData?.seasons.length}`);
    fullData?.seasons.forEach(s => {
        console.log(`    - S${s.seasonNumber}: Rating ${s.rating}, Ranking ${s.ranking}`);
    });

    db.close();
    console.log("\n\x1b[35m✓ end\x1b[0m");
}

main().catch(console.error);
