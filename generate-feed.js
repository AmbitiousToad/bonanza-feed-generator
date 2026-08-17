import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import fs from 'fs/promises';

const CONFIG = {
    pageUrl: 'https://robstenders.nl/podcast/9/index',
    feedTitle: 'De Bonanza',
    feedDescription: 'De Bonanza met Rob Stenders is elke werkdag van 14:00 tot 16:00 uur te horen op Radio Veronica. Dit is geen officiële podcast feed van Veronica of Rob Stenders. De feed wordt automatisch gegenereerd op basis van informatie op de website van Rob Stenders.',
    feedAuthor: 'Rob Stenders',
    feedLanguage: 'nl-nl',
    feedImage: 'https://pbs.twimg.com/profile_images/646042764493373441/q3Cw3a5y.png',
    requestTimeout: 45000
};

// Ophaalmethodes, in volgorde van voorkeur
const FETCH_METHODS = [
    {
        naam: 'direct',
        url: (target) => target
    },
    {
        naam: 'allorigins',
        url: (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`
    },
    {
        naam: 'codetabs',
        url: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`
    }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function haalOp(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'nl-NL,nl;q=0.9'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        return await response.text();
    } finally {
        clearTimeout(timeoutId);
    }
}

async function haalPaginaOp() {
    for (const methode of FETCH_METHODS) {
        for (let poging = 1; poging <= 2; poging++) {
            try {
                console.log(`Methode "${methode.naam}", poging ${poging}/2`);
                const html = await haalOp(methode.url(CONFIG.pageUrl));

                if (!html || html.length < 500) {
                    throw new Error(`Verdacht korte respons (${html ? html.length : 0} tekens)`);
                }

                console.log(`Gelukt via "${methode.naam}" (${html.length} tekens)`);
                return html;
            } catch (error) {
                console.warn(`  mislukt: ${error.message}`);
                if (poging === 1) await sleep(3000);
            }
        }
    }

    return null;
}

async function generatePodcastFeed() {
    const html = await haalPaginaOp();

    if (html === null) {
        console.warn('Pagina via geen enkele methode op te halen. Bestaande feed.xml blijft ongewijzigd.');
        process.exit(0);
    }

    try {
        const dom = new JSDOM(html);
        const document = dom.window.document;

        const links = Array.from(document.querySelectorAll('a[href$=".mp3"]'));
        console.log(`${links.length} MP3-links gevonden`);

        if (links.length === 0) {
            console.warn('Geen MP3-links gevonden. Bestaande feed.xml blijft ongewijzigd.');
            process.exit(0);
        }

        let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
    <channel>
        <title>${escapeXml(CONFIG.feedTitle)}</title>
        <description>${escapeXml(CONFIG.feedDescription)}</description>
        <link>${escapeXml(CONFIG.pageUrl)}</link>
        <language>${CONFIG.feedLanguage}</language>
        <itunes:author>${escapeXml(CONFIG.feedAuthor)}</itunes:author>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`;

        if (CONFIG.feedImage) {
            rss += `
        <itunes:image href="${escapeXml(CONFIG.feedImage)}"/>
        <image>
            <url>${escapeXml(CONFIG.feedImage)}</url>
            <title>${escapeXml(CONFIG.feedTitle)}</title>
            <link>${escapeXml(CONFIG.pageUrl)}</link>
        </image>`;
        }

        for (const link of links) {
            const url = new URL(link.getAttribute('href'), CONFIG.pageUrl).href;
            const rawTitle = link.textContent.trim() || url.split('/').pop();

            const dateMatch = rawTitle.match(/(\d{2})-(\d{2})-(\d{4})/);
            let title = rawTitle;
            let pubDate = new Date().toUTCString();

            if (dateMatch) {
                const [, day, month, year] = dateMatch;
                const date = new Date(`${year}-${month}-${day}`);

                const days = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
                const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

                title = `${days[date.getDay()]} ${parseInt(day)} ${months[date.getMonth()]} ${year} - De Bonanza`;
                pubDate = date.toUTCString();
            }

            rss += `
        <item>
            <title>${escapeXml(title)}</title>
            <description>${escapeXml(title)}</description>
            <enclosure url="${escapeXml(url)}" type="audio/mpeg" length="0"/>
            <guid isPermaLink="true">${escapeXml(url)}</guid>
            <pubDate>${pubDate}</pubDate>
            <itunes:duration>00:00:00</itunes:duration>
        </item>`;
        }

        rss += `
    </channel>
</rss>`;

        await fs.writeFile('feed.xml', rss);
        console.log('Feed generated successfully!');
    } catch (error) {
        console.error('Error generating feed:', error);
        process.exit(1);
    }
}

function escapeXml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe.toString().replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

generatePodcastFeed();
