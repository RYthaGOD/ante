/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/ante_market.json`.
 */
export type AnteMarket = {
  "address": "G1tgXodmDq9X3MTtdHLNpjDWscUqsjiW29fcpUHvJoHu",
  "metadata": {
    "name": "anteMarket",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "ANTE — verifiable settlement for World Cup prediction markets"
  },
  "instructions": [
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "bet",
          "writable": true
        },
        {
          "name": "bettor",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "closeMarket",
      "discriminator": [
        88,
        154,
        248,
        186,
        48,
        14,
        123,
        244
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "initializeMarket",
      "discriminator": [
        35,
        35,
        189,
        193,
        155,
        48,
        170,
        203
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": "string"
        },
        {
          "name": "fixtureId",
          "type": "string"
        },
        {
          "name": "kind",
          "type": {
            "defined": {
              "name": "marketKind"
            }
          }
        },
        {
          "name": "settleAfter",
          "type": "i64"
        },
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "feedPubkey",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "placeBet",
      "discriminator": [
        222,
        62,
        67,
        220,
        63,
        166,
        126,
        33
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "bet",
          "writable": true
        },
        {
          "name": "bettor",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "outcome"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "postCustomResult",
      "discriminator": [
        228,
        7,
        169,
        51,
        3,
        209,
        134,
        72
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "oracle",
          "signer": true
        },
        {
          "name": "instructions",
          "docs": [
            "the sysvar loader for ed25519 introspection."
          ],
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "winningOutcome",
          "type": {
            "defined": {
              "name": "outcome"
            }
          }
        },
        {
          "name": "resultDigest",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "postResult",
      "discriminator": [
        209,
        11,
        193,
        110,
        192,
        1,
        142,
        9
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "oracle",
          "signer": true
        },
        {
          "name": "instructions",
          "docs": [
            "the sysvar loader for ed25519 introspection."
          ],
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "homeGoals",
          "type": "u8"
        },
        {
          "name": "awayGoals",
          "type": "u8"
        },
        {
          "name": "resultDigest",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "setFeed",
      "discriminator": [
        79,
        150,
        2,
        207,
        41,
        104,
        77,
        41
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "newFeed",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setOracle",
      "discriminator": [
        186,
        128,
        81,
        104,
        74,
        79,
        18,
        224
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "newOracle",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setSettleAfter",
      "discriminator": [
        151,
        61,
        236,
        240,
        163,
        251,
        49,
        97
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "newSettleAfter",
          "type": "i64"
        }
      ]
    },
    {
      "name": "voidMarket",
      "discriminator": [
        243,
        175,
        46,
        124,
        95,
        101,
        39,
        69
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "bet",
      "discriminator": [
        147,
        23,
        35,
        59,
        15,
        75,
        155,
        32
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    }
  ],
  "events": [
    {
      "name": "marketResolved",
      "discriminator": [
        89,
        67,
        230,
        95,
        143,
        106,
        199,
        202
      ]
    },
    {
      "name": "marketVoided",
      "discriminator": [
        217,
        12,
        138,
        39,
        108,
        75,
        89,
        26
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "marketIdTooLong",
      "msg": "market id too long"
    },
    {
      "code": 6001,
      "name": "fixtureIdTooLong",
      "msg": "fixture id too long"
    },
    {
      "code": 6002,
      "name": "feeTooHigh",
      "msg": "fee exceeds the maximum"
    },
    {
      "code": 6003,
      "name": "zeroAmount",
      "msg": "amount must be greater than zero"
    },
    {
      "code": 6004,
      "name": "badOutcome",
      "msg": "outcome must be Yes or No"
    },
    {
      "code": 6005,
      "name": "marketClosed",
      "msg": "market is not open"
    },
    {
      "code": 6006,
      "name": "bettingClosed",
      "msg": "betting is closed for this market"
    },
    {
      "code": 6007,
      "name": "marketHasFunds",
      "msg": "cannot close a market that still holds staked funds"
    },
    {
      "code": 6008,
      "name": "overflow",
      "msg": "arithmetic overflow"
    },
    {
      "code": 6009,
      "name": "alreadyResolved",
      "msg": "market already resolved"
    },
    {
      "code": 6010,
      "name": "notOracle",
      "msg": "signer is not the market oracle"
    },
    {
      "code": 6011,
      "name": "tooEarly",
      "msg": "too early to settle"
    },
    {
      "code": 6012,
      "name": "wrongKind",
      "msg": "wrong settlement instruction for this market kind"
    },
    {
      "code": 6013,
      "name": "digestMismatch",
      "msg": "result digest does not match posted result"
    },
    {
      "code": 6014,
      "name": "missingFeedSignature",
      "msg": "missing ed25519 feed signature instruction"
    },
    {
      "code": 6015,
      "name": "malformedFeedSignature",
      "msg": "malformed ed25519 feed signature instruction"
    },
    {
      "code": 6016,
      "name": "wrongFeedSigner",
      "msg": "feed signature is not from this market's feed key"
    },
    {
      "code": 6017,
      "name": "wrongFeedMessage",
      "msg": "feed signature covers a different result"
    },
    {
      "code": 6018,
      "name": "notResolved",
      "msg": "market not resolved yet"
    },
    {
      "code": 6019,
      "name": "alreadyClaimed",
      "msg": "bet already claimed"
    },
    {
      "code": 6020,
      "name": "notAWinner",
      "msg": "bet is not on the winning outcome"
    },
    {
      "code": 6021,
      "name": "noWinners",
      "msg": "no winning stake in pool"
    },
    {
      "code": 6022,
      "name": "wrongMarket",
      "msg": "bet does not belong to this market"
    },
    {
      "code": 6023,
      "name": "notYourBet",
      "msg": "bet does not belong to this signer"
    }
  ],
  "types": [
    {
      "name": "bet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "bettor",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "feedPubkey",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "string"
          },
          {
            "name": "fixtureId",
            "type": "string"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "marketKind"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "settleAfter",
            "type": "i64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "poolYes",
            "type": "u64"
          },
          {
            "name": "poolNo",
            "type": "u64"
          },
          {
            "name": "winningOutcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "resultDigest",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "homeWin"
          },
          {
            "name": "over25"
          },
          {
            "name": "custom"
          }
        ]
      }
    },
    {
      "name": "marketResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "string"
          },
          {
            "name": "winningOutcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "resultDigest",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "homeGoals",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "awayGoals",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "feedVerified",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "marketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "resolved"
          },
          {
            "name": "voided"
          }
        ]
      }
    },
    {
      "name": "marketVoided",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "outcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "unresolved"
          },
          {
            "name": "yes"
          },
          {
            "name": "no"
          }
        ]
      }
    }
  ]
};
