-- Kullanıcı kendi hesabını siler (auth user cascade ile users tablosunu da siler)
CREATE OR REPLACE FUNCTION public.delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Kimlik doğrulama gerekli';
  END IF;
  -- users tablosundan sil (cascade ile ilişkili kayıtlar silinmeli)
  DELETE FROM public.users WHERE id = v_user_id;
  -- Auth kullanıcısını sil
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

-- Sadece kendi hesabını silebilir (SECURITY DEFINER ile zaten güvenli)
REVOKE ALL ON FUNCTION public.delete_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;
