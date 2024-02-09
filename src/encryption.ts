import * as crypto from 'crypto'
import {
    CipherCCMTypes,
    CipherGCMTypes,
    CipherKey,
    CipherOCBTypes,
} from 'crypto'

const splitEncryptedText = (encryptedText: string) => {
    return {
        ivString: encryptedText.slice(0, 32),
        encryptedDataString: encryptedText.slice(32),
    }
}

export interface EncryptionParams {
    key: string
    encoding?: BufferEncoding
    algo?: string | CipherCCMTypes | CipherGCMTypes | CipherOCBTypes
}

export interface Cryptor {
    encrypt: (plaintext: string) => string
    decrypt: (cipherText: string) => string
}

const createKeyFromSecret = (secret: string): string => {
    return crypto
        .createHash('sha256')
        .update(String(secret))
        .digest('base64')
        .substring(0, 32)
}

export default function Encryption({
    key,
    encoding = 'hex',
    algo = 'aes-256-cbc',
}: EncryptionParams): Cryptor {
    // process.env.CRYPTO_KEY should be a 32 BYTE key
    // key: string = process.env.CRYPTO_KEY;
    const secret32BitString: CipherKey = createKeyFromSecret(key)

    const encrypt = (plaintext: string) => {
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv(algo, secret32BitString, iv)

        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf-8'),
            cipher.final(),
        ])

        return iv.toString(encoding) + encrypted.toString(encoding)
    }

    const decrypt = (cipherText: string): string => {
        const { encryptedDataString, ivString } = splitEncryptedText(cipherText)

        const iv = Buffer.from(ivString, encoding)
        const encryptedText = Buffer.from(encryptedDataString, encoding)

        const decipher = crypto.createDecipheriv(algo, secret32BitString, iv)

        const decrypted = decipher.update(encryptedText)
        return Buffer.concat([decrypted, decipher.final()]).toString()
    }

    return {
        encrypt,
        decrypt,
    }
}
