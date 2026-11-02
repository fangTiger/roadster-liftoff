import { nftPresentation } from '../_lib/nft.js';
import { bitsToCount, formatMs } from '../../src/chain/records.js';
import { SITE_URL, getServerConfig, createTokenReader, getTokenId, jsonResponse, tokenErrorResponse } from '../_lib/chain.js';

export function createMetadataHandler(options = {}) {
  return async request => {
    const id = getTokenId(request);
    if (id === null) return jsonResponse({ error: 'Invalid token ID' }, 400);
    try {
      const config = { ...getServerConfig(), ...options };
      const { record, best } = await (config.readToken || createTokenReader(config))(id);
      const appearance = nftPresentation(record, best);
      return jsonResponse({
        name: `Mars Roadster First Lap #${id.toString().padStart(4, '0')}`,
        description: `A keepsake commemorating the first qualifying lap in Mars Roadster. Results are ${best.verified ? 'verified by the server' : 'self-reported by the player'}. This NFT is non-transferable. Mars Roadster is a non-commercial fan tribute, with no affiliation with Tesla or SpaceX.`,
        image: `${config.siteUrl.replace(/\/+$/, '')}/api/nft/image/${id}?v=${Number(best.updatedAt) > Number(record.updatedAt) ? best.updatedAt : record.updatedAt}`,
        animation_url: `${config.siteUrl.replace(/\/+$/, '')}/api/nft/view/${id}?v=${Number(best.updatedAt) > Number(record.updatedAt) ? best.updatedAt : record.updatedAt}`,
        external_url: SITE_URL,
        attributes: [
          { trait_type: 'Track', value: appearance.trackName },
          { trait_type: 'Tier', value: appearance.label },
          { trait_type: 'First lap', value: formatMs(record.firstLapMs) },
          { trait_type: 'Best lap', value: formatMs(appearance.bestMs) },
          { trait_type: 'Achievements', value: bitsToCount(record.achievements), max_value: 28, display_type: 'number' },
          { trait_type: 'Minted', value: Number(record.mintedAt), display_type: 'date' },
          { trait_type: 'Network', value: config.network === 'mainnet' ? 'Arc' : 'Arc Testnet' },
        ],
      }, 200, 'public, s-maxage=60, stale-while-revalidate=300');
    } catch (error) {
      return tokenErrorResponse(error);
    }
  };
}

export async function GET(request) {
  return createMetadataHandler()(request);
}
