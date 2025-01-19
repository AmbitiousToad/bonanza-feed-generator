import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import fs from 'fs/promises';

const CONFIG = {
    pageUrl: 'https://robstenders.nl/podcast/9/index',  // <- Change this!
    feedTitle: 'De Bonanza', // <- Change this!
    feedDescription: 'De Bonanza met Rob Stenders is elke werkdag van 14:00 tot 16:00 uur te horen op Radio Veronica. Dit is geen officiële podcast feed van Veronica of Rob Stenders. De feed wordt automatisch gegenereerd op basis van informatie op de website van Rob Stenders.', // <- Change this!
    feedAuthor: 'Rob Stenders', // <- Change this!
    feedLanguage: 'nl-nl',
    feedImage: 'https://pbs.twimg.com/profile_images/646042764493373441/q3Cw3a5y.png'  // Optional: Add URL to podcast artwork
};

async function generatePodcastFeed() {
    try {
        // Fetch the webpage
        const response = await fetch(CONFIG.pageUrl);
        const html = await response.text();
        
        // Parse HTML
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        // Find all MP3 links
        const links = Array.from(document.querySelectorAll('a[href$=".mp3"]'));
        
        // Generate RSS feed
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
        
        // Process each MP3 link
        for (const link of links) {
            const url = new URL(link.href, CONFIG.pageUrl).href;
            const title = link.textContent.trim() || url.split('/').pop();
            
            // Try to extract date from filename or link text
            const dateMatch = (url + title).match(/(\d{4}[-_]?\d{2}[-_]?\d{2})/);
            const pubDate = dateMatch 
                ? new Date(dateMatch[1].replace(/_/g, '-')).toUTCString()
                : new Date().toUTCString();
            
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
        
        // Save the feed
        await fs.writeFile('feed.xml', rss);
        console.log('Feed generated successfully!');
        
    } catch (error) {
        console.error('Error generating feed:', error);
        process.exit(1);
    }
}

function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

generatePodcastFeed();