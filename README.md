# TRON Wallet Portable

Windows desktop wallet for **TRON Mainnet**.

Features: import an existing private key, encrypted local vault (AES-256-GCM + scrypt), TRX/USDT balances, TRX/USDT transfers, local signing, portable x64 Windows build.

## Build on GitHub
Upload all files preserving folders. Open **Actions → Build Windows Portable → Run workflow**. Download the `TRON-Wallet-Portable` artifact after the run succeeds.

## Important security notes
This is an initial wallet implementation, not an independently audited product. Review the source before using real funds and first test with a very small amount. Never share your private key. The app uses TRON Mainnet and transactions are irreversible. The executable is unsigned, so Windows SmartScreen may warn.

The USDT contract is fixed to TRON Mainnet address `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`. USDT uses 6 decimals. TRC-20 transfers can consume Energy and TRX.
