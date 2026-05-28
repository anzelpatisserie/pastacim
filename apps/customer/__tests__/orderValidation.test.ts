describe('sipariş validasyon kuralları', () => {
  it('kişi sayısı 0 veya negatif kabul edilmemeli', () => {
    const isValidServingSize = (n: number) => n > 0;
    expect(isValidServingSize(0)).toBe(false);
    expect(isValidServingSize(-1)).toBe(false);
    expect(isValidServingSize(1)).toBe(true);
    expect(isValidServingSize(50)).toBe(true);
  });

  it('başlık en az 3 karakter olmalı', () => {
    const isValidTitle = (t: string) => t.trim().length >= 3;
    expect(isValidTitle('')).toBe(false);
    expect(isValidTitle('ab')).toBe(false);
    expect(isValidTitle('abc')).toBe(true);
    expect(isValidTitle('Doğum günü pastası')).toBe(true);
  });

  it('geçerli email formatı kontrolü', () => {
    const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
    expect(isValidEmail('gecersiz')).toBe(false);
    expect(isValidEmail('test@')).toBe(false);
    expect(isValidEmail('test@domain.com')).toBe(true);
  });
});
