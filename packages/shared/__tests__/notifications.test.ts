jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { notifyNewMessage } from '../lib/notifications';

jest.mock('../lib/supabase', () => {
  const rpc = jest.fn().mockResolvedValue({ data: null });
  return { supabase: { rpc, from: jest.fn() } };
});

describe('notifyNewMessage', () => {
  it('calls notify_new_message RPC with dedup params and no push when no token', async () => {
    const { supabase } = require('../lib/supabase');
    await notifyNewMessage({ receiverId: 'r1', senderId: 's1', preview: 'selam' });
    expect(supabase.rpc).toHaveBeenCalledWith('notify_new_message', {
      p_receiver_id: 'r1', p_sender_id: 's1', p_target_role: null, p_preview: 'selam', p_push: true,
    });
  });
});
