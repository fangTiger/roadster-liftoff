import { bitsToCount, formatMs } from '../../src/chain/records.js';
import { SITE_URL, getServerConfig, createTokenReader, getTokenId, jsonResponse, tokenErrorResponse } from '../_lib/chain.js';

export function createMetadataHandler(options = {}) {
  return async request => {
    const id = getTokenId(request);
    if (id === null) return jsonResponse({ error: 'Invalid token ID' }, 400);
    try {
      const config = { ...getServerConfig(), ...options };
      const { record } = await (config.readToken || createTokenReader(config))(id);
      return jsonResponse({
        name: `Mars Roadster Round Trip #${id.toString().padStart(4, '0')}`,
        description: 'A keepsake commemorating a completed ground-to-orbit-to-ground round trip in Mars Roadster. Results are self-reported by the player. This NFT is non-transferable. Mars Roadster is a non-commercial fan tribute, with no affiliation with Tesla or SpaceX.',
        image: `${config.siteUrl.replace(/\/+$/, '')}/api/nft/image/${id}?v=${record.updatedAt}`,
        external_url: SITE_URL,
        attributes: [
          { trait_type: 'Round trip', value: formatMs(record.bestMs) },
          { trait_type: 'Round trip (ms)', value: Number(record.bestMs), display_type: 'number' },
          { trait_type: 'Achievements', value: bitsToCount(record.achievements), max_value: 20, display_type: 'number' },
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
