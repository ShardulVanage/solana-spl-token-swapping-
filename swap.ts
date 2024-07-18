const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const { TokenSwap, CurveType, TOKEN_SWAP_PROGRAM_ID } = require('@solana/spl-token-swap');

// Replace these with your own values
const WALLET_PRIVATE_KEY = ["svtGyLV5kV8nWWgTnDNEzu1fRS8P8wHictTXshaqPNt"]; // Your wallet private key as a Uint8Array
const TOKEN_A_MINT = "ATopab8nw37ZmMrhaJ7GWxmCb8G9khFZgjoqe1HTNha8"; // Public key of Token A mint
const TOKEN_B_MINT = "BTom56uy58Qg2FUzepwM3wuTZPTsFEyUodFqVU9D8Rdz"; // Public key of Token B mint

async function main() {
    // Connect to devnet
    const connection = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');

    // Create a wallet from the private key
    const wallet = web3.Keypair.fromSecretKey(Uint8Array.from(WALLET_PRIVATE_KEY));

    console.log('Wallet public key:', wallet.publicKey.toBase58());

    // Create Token A and Token B mints if they don't exist
    const tokenAMint = await createMintIfNotExists(connection, wallet, TOKEN_A_MINT);
    const tokenBMint = await createMintIfNotExists(connection, wallet, TOKEN_B_MINT);

    // Create token accounts for the wallet
    const tokenAAccount = await createTokenAccountIfNotExists(connection, wallet, tokenAMint);
    const tokenBAccount = await createTokenAccountIfNotExists(connection, wallet, tokenBMint);

    // Mint some tokens to the wallet's token accounts
    await mintTokens(connection, wallet, tokenAMint, tokenAAccount, 1000000);
    await mintTokens(connection, wallet, tokenBMint, tokenBAccount, 1000000);

    // Create the token swap
    const tokenSwap = await createTokenSwap(connection, wallet, tokenAMint, tokenBMint);

    // Perform a swap
    await performSwap(connection, wallet, tokenSwap, tokenAAccount, tokenBAccount, 100000);

    console.log('Token swap completed successfully!');
}

async function createMintIfNotExists(connection, wallet, mintPublicKey) {
    try {
        const mint = new web3.PublicKey(mintPublicKey);
        await splToken.getMint(connection, mint);
        console.log(`Mint ${mintPublicKey} already exists`);
        return mint;
    } catch (error) {
        console.log(`Creating new mint ${mintPublicKey}`);
        return await splToken.createMint(
            connection,
            wallet,
            wallet.publicKey,
            null,
            9
        );
    }
}

async function createTokenAccountIfNotExists(connection, wallet, mint) {
    const associatedTokenAccount = await splToken.getAssociatedTokenAddress(
        mint,
        wallet.publicKey
    );

    try {
        await splToken.getAccount(connection, associatedTokenAccount);
        console.log(`Token account ${associatedTokenAccount.toBase58()} already exists`);
    } catch (error) {
        console.log(`Creating token account ${associatedTokenAccount.toBase58()}`);
        await splToken.createAssociatedTokenAccount(
            connection,
            wallet,
            mint,
            wallet.publicKey
        );
    }

    return associatedTokenAccount;
}

async function mintTokens(connection, wallet, mint, tokenAccount, amount) {
    await splToken.mintTo(
        connection,
        wallet,
        mint,
        tokenAccount,
        wallet,
        amount
    );
    console.log(`Minted ${amount} tokens to ${tokenAccount.toBase58()}`);
}

async function createTokenSwap(connection, wallet, tokenAMint, tokenBMint) {
    const tokenSwapAccount = web3.Keypair.generate();
    const [swapAuthority, bump] = await web3.PublicKey.findProgramAddress(
        [tokenSwapAccount.publicKey.toBuffer()],
        TOKEN_SWAP_PROGRAM_ID
    );

    const tokenAccountA = await splToken.getAssociatedTokenAddress(tokenAMint, swapAuthority, true);
    const tokenAccountB = await splToken.getAssociatedTokenAddress(tokenBMint, swapAuthority, true);

    const poolTokenMint = await splToken.createMint(
        connection,
        wallet,
        swapAuthority,
        null,
        9
    );

    const poolTokenAccount = await splToken.getAssociatedTokenAddress(poolTokenMint, wallet.publicKey);

    await splToken.createAssociatedTokenAccount(
        connection,
        wallet,
        poolTokenMint,
        wallet.publicKey
    );

    const tokenSwap = await TokenSwap.createTokenSwap(
        connection,
        wallet,
        tokenSwapAccount,
        swapAuthority,
        tokenAccountA,
        tokenAccountB,
        poolTokenMint,
        tokenAMint,
        tokenBMint,
        poolTokenAccount,
        TOKEN_SWAP_PROGRAM_ID,
        splToken.TOKEN_PROGRAM_ID,
        0,
        100,
        20,
        10,
        CurveType.ConstantProduct,
        bump
    );

    console.log('Token swap created:', tokenSwapAccount.publicKey.toBase58());
    return tokenSwap;
}

async function performSwap(connection, wallet, tokenSwap, sourceTokenAccount, destinationTokenAccount, amount) {
    await tokenSwap.swap(
        sourceTokenAccount,
        tokenSwap.tokenAccountA,
        tokenSwap.tokenAccountB,
        destinationTokenAccount,
        tokenSwap.poolToken,
        tokenSwap.feeAccount,
        null,
        amount,
        0
    );
    console.log(`Swapped ${amount} tokens`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});