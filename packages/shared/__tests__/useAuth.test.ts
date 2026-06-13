// Mock Supabase before imports
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
      then: jest.fn().mockResolvedValue({}),
      catch: jest.fn().mockResolvedValue({}),
    }),
  },
}));

import { renderHook, act } from '@testing-library/react-native';
import { useAuth } from '../hooks/useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply default mocks after clear
    const { supabase } = require('../lib/supabase');
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
      then: jest.fn().mockResolvedValue({}),
      catch: jest.fn().mockResolvedValue({}),
    });
  });

  it('başlangıçta isLoading true, isAuthenticated false olmalı', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('oturum yoksa isBaker false olmalı', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isBaker).toBe(false);
  });

  it('oturum yoksa isCustomer true olmalı (default)', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isCustomer).toBe(true);
  });

  it('hatalı email/şifre → Türkçe hata mesajı döner', async () => {
    const { supabase } = require('../lib/supabase');
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
    });

    const { result } = renderHook(() => useAuth());
    let response!: { error: string | null };

    await act(async () => {
      response = await result.current.signIn('test@test.com', 'yanlis');
    });

    expect(response.error).toBe('E-posta veya şifre hatalı.');
  });

  it('başarılı signUp → hata null döner', async () => {
    const { supabase } = require('../lib/supabase');
    supabase.auth.signUp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: null,
    });

    const { result } = renderHook(() => useAuth());
    let response!: { error: string | null };

    await act(async () => {
      response = await result.current.signUp({
        email: 'yeni@test.com',
        password: '123456',
        fullName: 'Test Kullanıcı',
      });
    });

    expect(response.error).toBeNull();
  });

  it('kayıtlı email ile signUp → Türkçe hata döner', async () => {
    const { supabase } = require('../lib/supabase');
    supabase.auth.signUp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'User already registered' },
    });

    const { result } = renderHook(() => useAuth());
    let response!: { error: string | null };

    await act(async () => {
      response = await result.current.signUp({
        email: 'mevcut@test.com',
        password: '123456',
        fullName: 'Test',
      });
    });

    expect(response.error).toBe('Bu e-posta adresi zaten kullanımda.');
  });
});
