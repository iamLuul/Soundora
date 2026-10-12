// Edge Function respondeu 401 (token vencido): renova a sessão e tenta de novo uma vez.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { fetchRecommendations } from '../src/lib/api';

const mockInvoke = jest.fn();
const mockRefresh = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    auth: { refreshSession: () => mockRefresh() },
  },
}));

const unauthorized = () => ({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'not_authenticated' }), { status: 401 })) });

beforeEach(() => jest.clearAllMocks());

test('401 → renova a sessão e a segunda tentativa vale', async () => {
  mockInvoke.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce({ data: { cards: [] }, error: null });
  mockRefresh.mockResolvedValue({ data: { session: { access_token: 'novo' } }, error: null });
  await expect(fetchRecommendations(null)).resolves.toEqual([]);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(mockInvoke).toHaveBeenCalledTimes(2);
});

test('sessão não renova: devolve o erro de login, sem ficar tentando', async () => {
  mockInvoke.mockResolvedValue(unauthorized());
  mockRefresh.mockResolvedValue({ data: { session: null }, error: new Error('refresh_token_not_found') });
  await expect(fetchRecommendations(null)).rejects.toMatchObject({ code: 'not_authenticated' });
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});
