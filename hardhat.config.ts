import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.18',
        settings: {
            viaIR: false,
            optimizer: {
                enabled: true,
                runs: 1000,
                details: {
                    yul: false,
                },
            },
        },
    },
}

export default config
