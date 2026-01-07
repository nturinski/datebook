import { app } from '@azure/functions';

// IMPORTANT: Ensure all code-first functions are loaded so the runtime can index them.
// Without this, newly added functions may not be registered and will return 404.
import './functions/auth-verify';
import './functions/cors-preflight';
import './functions/entries';
import './functions/health';
import './functions/googlePlaces';
import './functions/me';
import './functions/media';
import './functions/relationships';
import './functions/scrapbooks';
import './functions/scrapbookPages';
import './functions/scrapbookPageStickers';
import './functions/scrapbookPageTexts';
import './functions/coupons';
import './functions/pushTokens';
import './functions/users';
import './functions/users-list';

app.setup({
    enableHttpStream: true,
});
