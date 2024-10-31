import { Bot } from '@skyware/bot';

import { BSKY_IDENTIFIER, BSKY_PASSWORD } from './config.js';
import { LABELS } from './constants.js';
import sharp from 'sharp';

const bot = new Bot();

try {
  await bot.login({
    identifier: BSKY_IDENTIFIER,
    password: BSKY_PASSWORD,
  });
} catch (error) {
  console.error('Error logging in: ', error);
  process.exit(1);
}

process.stdout.write('WARNING: This will delete all posts in your profile. Are you sure you want to continue? (y/n) ');

const answer = await new Promise((resolve) => {
  process.stdin.once('data', (data) => {
    resolve(data.toString().trim().toLowerCase());
  });
});

if (answer === 'y') {
  const postsToDelete = await bot.profile.getPosts();
  for (const post of postsToDelete.posts) {
    await post.delete();
  }
  console.log('All posts have been deleted.');
} else {
  console.log('Operation cancelled.');
  process.exit(0);
}

const post = await bot.post({
  text: 'Like the replies to this post to receive labels.',
  threadgate: { allowLists: [] },
});

interface Card {
  error: string;
  likely_type: string;
  url: string;
  title: string;
  description: string;
  image: string;
}

const labelNamesAndUrls = LABELS.map((label) => ({ name: label.locales[0].name, url: label.typeinmindUrl }));
const labelRkeys: Record<string, string> = {};
for (const label of labelNamesAndUrls) {
  const card: Card = await (async (url: string) => {
    const res = await fetch(`https://cardyb.bsky.app/v1/extract?url=${encodeURIComponent(url)}`);
    return await res.json() as Card;
  })(label.url);
  const image = await (async (url: string) => {
    const res = await fetch(url);
    return await res.arrayBuffer();
  })(card.image);
  const imageBuffer = await sharp(image).jpeg({ quality: 90 }).toBuffer();
  const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
  const labelPost = await post.reply({
    text: label.name,
    facets: [
      {
        index: {
          byteStart: 0,
          byteEnd: label.name.length
        },
        features: [
          {
            $type: 'app.bsky.richtext.facet#link',
            uri: label.url,
          },
        ],
      },
    ],
    external: {
      uri: card.url,
      title: card.title,
      description: card.description,
      thumb: {
        data: imageBlob,
      }
    },
  });
  labelRkeys[label.name] = labelPost.uri.split('/').pop()!;
}

console.log('Label rkeys:');
for (const [name, rkey] of Object.entries(labelRkeys)) {
  console.log(`    name: '${name}',`);
  console.log(`    rkey: '${rkey}',`);
}

const deletePost = await bot.post({ text: 'Like this post to delete all labels.' });
const deletePostRkey = deletePost.uri.split('/').pop()!;
console.log('Delete post rkey:');
console.log(`export const DELETE = '${deletePostRkey}';`);

process.exit(0);
