describe('cüzdan iş mantığı', () => {
  it('teklif ücreti kişi sayısı × 5 TL olmalı', () => {
    const calculateFee = (servingSize: number) => servingSize * 5;
    expect(calculateFee(10)).toBe(50);
    expect(calculateFee(1)).toBe(5);
    expect(calculateFee(20)).toBe(100);
  });

  it('bakiye yeterli kontrolü', () => {
    const hasSufficientBalance = (balance: number, fee: number) => balance >= fee;
    expect(hasSufficientBalance(50, 50)).toBe(true);
    expect(hasSufficientBalance(49, 50)).toBe(false);
    expect(hasSufficientBalance(100, 25)).toBe(true);
  });

  it('wallet_balance TL formatında gösterilmeli', () => {
    const formatBalance = (balance: number) => `₺${balance.toFixed(2)}`;
    expect(formatBalance(125.5)).toBe('₺125.50');
    expect(formatBalance(0)).toBe('₺0.00');
    expect(formatBalance(1000)).toBe('₺1000.00');
  });

  it('yetersiz bakiye hata kodu kontrolü', () => {
    const isInsufficientBalance = (err: unknown) =>
      (err as { error?: string } | null)?.error === 'yetersiz_bakiye';
    expect(isInsufficientBalance({ error: 'yetersiz_bakiye' })).toBe(true);
    expect(isInsufficientBalance({ error: 'baska_hata' })).toBe(false);
    expect(isInsufficientBalance(null)).toBe(false);
  });
});
