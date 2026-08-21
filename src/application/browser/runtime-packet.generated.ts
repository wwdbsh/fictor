import type { BrowserRuntimePacketV1 } from "./runtime-packet";

export const BROWSER_RUNTIME_PACKET: BrowserRuntimePacketV1 = {
  "schemaVersion": "fictor-browser-runtime-packet-v1",
  "sourceHash": "be7a99ea52ecd92438ca8171e4d9d397ff68e56cc9ac59b6b33b9b78dc5446de",
  "counts": {
    "materials": 52,
    "laws": 21,
    "resultClasses": 34
  },
  "assetAvailability": {
    "manifestSha256": "1456506d259c95f3e68d8383b9fafe2ed026ffa260b9f82fc65960d5395a429b",
    "canonicalCardCount": 489,
    "materialPairBitsetHex": "def800fcf37fc0810f00180104d8ff03fcf33f00fdff873ffb0700f8008cf17f00800f0018000000f80080034000800f0038000400f80080034000800f0018000400f8008001400000ffffffffff00e0ffffffff0f00fcffffffff0080ffffffff0f00f0ffffffff0000008003400000000038000400000080034000000000180004000000800140000000003800040000008003400000000038000400000080014000000000180004000000800140000000001800040000008001400000000018000400000080014000000000f0ffff00000000feff0f000000403f3c0000000000000000000000000000000000e04f0000000000000400000000004000000000000004000000000040000000000000040000000000400000000000000400000000004000000000000004000000000080010000000000000000000000000000000000000000000000000000000000000000"
  },
  "resolverContext": {
    "resolverVersion": "canonical-v1",
    "sourceHash": "be7a99ea52ecd92438ca8171e4d9d397ff68e56cc9ac59b6b33b9b78dc5446de",
    "materials": [
      {
        "id": "ore_still",
        "attribute": "STILL",
        "modifier_form": "굳은",
        "noun_form": "덩이",
        "representation": "SOLID",
        "category": "ORE",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "ore_burn",
        "attribute": "BURN",
        "modifier_form": "타는",
        "noun_form": "불씨",
        "representation": "SOLID",
        "category": "ORE",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "ore_scatter",
        "attribute": "SCATTER",
        "modifier_form": "흩어지는",
        "noun_form": "티끌",
        "representation": "PHENOMENON",
        "category": "ORE",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "ore_rot",
        "attribute": "ROT",
        "modifier_form": "삭은",
        "noun_form": "부스러기",
        "representation": "SOLID",
        "category": "ORE",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "ore_wash",
        "attribute": "WASH",
        "modifier_form": "씻긴",
        "noun_form": "속살",
        "representation": "SOLID",
        "category": "ORE",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "ore_join",
        "attribute": "JOIN",
        "modifier_form": "엉긴",
        "noun_form": "뭉치",
        "representation": "SOLID",
        "category": "ORE",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "still_01",
        "attribute": "STILL",
        "modifier_form": "서리 낀",
        "noun_form": "서리꽃",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "still_02",
        "attribute": "STILL",
        "modifier_form": "멈춘",
        "noun_form": "물방울",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "still_03",
        "attribute": "STILL",
        "modifier_form": "잠긴",
        "noun_form": "발자국",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "still_04",
        "attribute": "STILL",
        "modifier_form": "숨 멎은",
        "noun_form": "입김",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "still_05",
        "attribute": "STILL",
        "modifier_form": "그친",
        "noun_form": "종소리",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "burn_01",
        "attribute": "BURN",
        "modifier_form": "달군",
        "noun_form": "잉걸",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "burn_02",
        "attribute": "BURN",
        "modifier_form": "그을린",
        "noun_form": "심지",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "burn_03",
        "attribute": "BURN",
        "modifier_form": "눌어붙은",
        "noun_form": "재",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "burn_04",
        "attribute": "BURN",
        "modifier_form": "뜨거운",
        "noun_form": "열",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "burn_05",
        "attribute": "BURN",
        "modifier_form": "불붙은",
        "noun_form": "불티",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "scat_01",
        "attribute": "SCATTER",
        "modifier_form": "가벼운",
        "noun_form": "뼈",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "scat_02",
        "attribute": "SCATTER",
        "modifier_form": "흩날리는",
        "noun_form": "씨",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "scat_03",
        "attribute": "SCATTER",
        "modifier_form": "벗겨진",
        "noun_form": "껍데기",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "scat_04",
        "attribute": "SCATTER",
        "modifier_form": "뜬",
        "noun_form": "먼지",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "scat_05",
        "attribute": "SCATTER",
        "modifier_form": "마른",
        "noun_form": "바람",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "rot_01",
        "attribute": "ROT",
        "modifier_form": "앉은",
        "noun_form": "딱지",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "rot_02",
        "attribute": "ROT",
        "modifier_form": "무른",
        "noun_form": "뿌리",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "rot_03",
        "attribute": "ROT",
        "modifier_form": "핀",
        "noun_form": "곰팡이",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "rot_04",
        "attribute": "ROT",
        "modifier_form": "번지는",
        "noun_form": "얼룩",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "rot_05",
        "attribute": "ROT",
        "modifier_form": "내려앉은",
        "noun_form": "냄새",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "wash_01",
        "attribute": "WASH",
        "modifier_form": "맑은",
        "noun_form": "눈물",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "wash_02",
        "attribute": "WASH",
        "modifier_form": "닳은",
        "noun_form": "돌",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "wash_03",
        "attribute": "WASH",
        "modifier_form": "빈",
        "noun_form": "껍질",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "wash_04",
        "attribute": "WASH",
        "modifier_form": "지워진",
        "noun_form": "자국",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "wash_05",
        "attribute": "WASH",
        "modifier_form": "가라앉은",
        "noun_form": "앙금",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "join_01",
        "attribute": "JOIN",
        "modifier_form": "엉킨",
        "noun_form": "실",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "join_02",
        "attribute": "JOIN",
        "modifier_form": "붙은",
        "noun_form": "손",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 1
      },
      {
        "id": "join_03",
        "attribute": "JOIN",
        "modifier_form": "자란",
        "noun_form": "매듭",
        "representation": "SOLID",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "join_04",
        "attribute": "JOIN",
        "modifier_form": "이어진",
        "noun_form": "그림자",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 2,
        "cost_base": 1
      },
      {
        "id": "join_05",
        "attribute": "JOIN",
        "modifier_form": "겹친",
        "noun_form": "소리",
        "representation": "PHENOMENON",
        "category": "GROUND_PRODUCT",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "tool_01",
        "attribute": "NONE",
        "modifier_form": "달궈진",
        "noun_form": "도가니",
        "representation": "SOLID",
        "category": "TOOL",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 0,
        "tool_domain": "FORGE"
      },
      {
        "id": "tool_02",
        "attribute": "NONE",
        "modifier_form": "집어올린",
        "noun_form": "집게",
        "representation": "SOLID",
        "category": "TOOL",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 0,
        "tool_domain": "HAND"
      },
      {
        "id": "tool_03",
        "attribute": "NONE",
        "modifier_form": "걸러진",
        "noun_form": "체",
        "representation": "SOLID",
        "category": "TOOL",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 0,
        "tool_domain": "DECK"
      },
      {
        "id": "tool_04",
        "attribute": "NONE",
        "modifier_form": "밝혀진",
        "noun_form": "등불",
        "representation": "SOLID",
        "category": "TOOL",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 0,
        "tool_domain": "INFO"
      },
      {
        "id": "tool_05",
        "attribute": "NONE",
        "modifier_form": "헤아린",
        "noun_form": "계측기",
        "representation": "SOLID",
        "category": "TOOL",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 0,
        "tool_domain": "SCALE"
      },
      {
        "id": "tool_06",
        "attribute": "NONE",
        "modifier_form": "불어넣은",
        "noun_form": "풀무",
        "representation": "SOLID",
        "category": "TOOL",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 0,
        "tool_domain": "ENERGY"
      },
      {
        "id": "tool_07",
        "attribute": "NONE",
        "modifier_form": "달아본",
        "noun_form": "저울",
        "representation": "SOLID",
        "category": "TOOL",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 0,
        "tool_domain": "BALANCE"
      },
      {
        "id": "tool_08",
        "attribute": "NONE",
        "modifier_form": "갈무리한",
        "noun_form": "표본 상자",
        "representation": "SOLID",
        "category": "TOOL",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 0,
        "tool_domain": "KEEP"
      },
      {
        "id": "tool_09",
        "attribute": "NONE",
        "modifier_form": "그려진",
        "noun_form": "지도",
        "representation": "SOLID",
        "category": "TOOL",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 0,
        "tool_domain": "ROUTE"
      },
      {
        "id": "tool_10",
        "attribute": "NONE",
        "modifier_form": "부려놓은",
        "noun_form": "손수레",
        "representation": "SOLID",
        "category": "TOOL",
        "balance_status": "APPROVED",
        "potency": 1,
        "cost_base": 0,
        "tool_domain": "CARRY"
      },
      {
        "id": "odd_01",
        "attribute": [
          "JOIN",
          "SCATTER"
        ],
        "modifier_form": "걸어다니는",
        "noun_form": "주전자",
        "representation": "SOLID",
        "category": "ODDITY",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "odd_02",
        "attribute": [
          "STILL",
          "JOIN"
        ],
        "modifier_form": "두 번 접힌",
        "noun_form": "사다리",
        "representation": "SOLID",
        "category": "ODDITY",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "odd_03",
        "attribute": [
          "BURN",
          "JOIN"
        ],
        "modifier_form": "스스로 켜지는",
        "noun_form": "초",
        "representation": "SOLID",
        "category": "ODDITY",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "odd_04",
        "attribute": [
          "WASH",
          "SCATTER"
        ],
        "modifier_form": "뒤집힌",
        "noun_form": "장갑",
        "representation": "SOLID",
        "category": "ODDITY",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "odd_05",
        "attribute": [
          "JOIN",
          "WASH"
        ],
        "modifier_form": "노래하는",
        "noun_form": "못",
        "representation": "SOLID",
        "category": "ODDITY",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      },
      {
        "id": "odd_06",
        "attribute": [
          "ROT",
          "STILL"
        ],
        "modifier_form": "자기를 재는",
        "noun_form": "자",
        "representation": "SOLID",
        "category": "ODDITY",
        "balance_status": "APPROVED",
        "potency": 3,
        "cost_base": 2
      }
    ],
    "inputs": {
      "laws": [
        {
          "pair": [
            "STILL",
            "BURN"
          ],
          "result_class": "PRESSED_FIRE",
          "actor": "STILL",
          "combat_effect": "DELAYED_EXPLOSION",
          "balance_status": "APPROVED",
          "power_coefficient": 2.25
        },
        {
          "pair": [
            "STILL",
            "SCATTER"
          ],
          "result_class": "SETTLING",
          "actor": "STILL",
          "combat_effect": "SLOW_TARGET",
          "balance_status": "APPROVED",
          "power_coefficient": 0.75
        },
        {
          "pair": [
            "STILL",
            "ROT"
          ],
          "result_class": "SCAB",
          "actor": "STILL",
          "combat_effect": "EXTEND_DOT",
          "balance_status": "APPROVED",
          "power_coefficient": 0.75
        },
        {
          "pair": [
            "STILL",
            "WASH"
          ],
          "result_class": "CRYSTAL",
          "actor": "STILL",
          "combat_effect": "PERMANENT_BLOCK",
          "balance_status": "APPROVED",
          "power_coefficient": 1.75
        },
        {
          "pair": [
            "STILL",
            "JOIN"
          ],
          "result_class": "HARDENED",
          "actor": "STILL",
          "combat_effect": "AMPLIFY_STILL",
          "balance_status": "APPROVED",
          "power_coefficient": 0.9
        },
        {
          "pair": [
            "BURN",
            "SCATTER"
          ],
          "result_class": "BLAST",
          "actor": "BURN",
          "combat_effect": "BURST_AOE",
          "balance_status": "APPROVED",
          "power_coefficient": 1.5
        },
        {
          "pair": [
            "BURN",
            "ROT"
          ],
          "result_class": "INCINERATION",
          "actor": "BURN",
          "combat_effect": "EXILE_AND_DAMAGE",
          "balance_status": "APPROVED",
          "power_coefficient": 1.5
        },
        {
          "pair": [
            "BURN",
            "WASH"
          ],
          "result_class": "SEARING",
          "actor": "BURN",
          "combat_effect": "DEBUFF_TO_DAMAGE",
          "balance_status": "APPROVED",
          "power_coefficient": 1.25
        },
        {
          "pair": [
            "BURN",
            "JOIN"
          ],
          "result_class": "KINDLED",
          "actor": "BURN",
          "combat_effect": "AMPLIFY_BURN",
          "balance_status": "APPROVED",
          "power_coefficient": 1
        },
        {
          "pair": [
            "SCATTER",
            "ROT"
          ],
          "result_class": "SPREADING",
          "actor": "SCATTER",
          "combat_effect": "SPREAD_DEBUFF",
          "balance_status": "APPROVED",
          "power_coefficient": 0.75
        },
        {
          "pair": [
            "SCATTER",
            "WASH"
          ],
          "result_class": "VANISHING",
          "actor": "SCATTER",
          "combat_effect": "EXILE",
          "balance_status": "APPROVED",
          "power_coefficient": 0.75
        },
        {
          "pair": [
            "SCATTER",
            "JOIN"
          ],
          "result_class": "QUICKENED",
          "actor": "SCATTER",
          "combat_effect": "AMPLIFY_SCATTER",
          "balance_status": "APPROVED",
          "power_coefficient": 0.9
        },
        {
          "pair": [
            "ROT",
            "WASH"
          ],
          "result_class": "NEUTRALIZED",
          "actor": "ROT",
          "combat_effect": "RESET_STATES",
          "balance_status": "APPROVED",
          "power_coefficient": 0.75
        },
        {
          "pair": [
            "ROT",
            "JOIN"
          ],
          "result_class": "FESTERED",
          "actor": "ROT",
          "combat_effect": "AMPLIFY_ROT",
          "balance_status": "APPROVED",
          "power_coefficient": 1
        },
        {
          "pair": [
            "WASH",
            "JOIN"
          ],
          "result_class": "CLARIFIED",
          "actor": "WASH",
          "combat_effect": "AMPLIFY_WASH",
          "balance_status": "APPROVED",
          "power_coefficient": 0.9
        },
        {
          "pair": [
            "STILL",
            "STILL"
          ],
          "result_class": "TOTAL_STOP",
          "actor": "STILL",
          "combat_effect": "MASSIVE_BLOCK",
          "balance_status": "APPROVED",
          "power_coefficient": 2,
          "drawback": "자신도 행동할 수 없다."
        },
        {
          "pair": [
            "BURN",
            "BURN"
          ],
          "result_class": "BURNOUT",
          "actor": "BURN",
          "combat_effect": "MAX_DAMAGE",
          "balance_status": "APPROVED",
          "power_coefficient": 2,
          "drawback": "자기 체력을 소모한다."
        },
        {
          "pair": [
            "SCATTER",
            "SCATTER"
          ],
          "result_class": "DISPERSAL",
          "actor": "SCATTER",
          "combat_effect": "MAX_EVASION",
          "balance_status": "APPROVED",
          "power_coefficient": 1.75,
          "drawback": "공격할 수 없다."
        },
        {
          "pair": [
            "ROT",
            "ROT"
          ],
          "result_class": "SELF_EATING",
          "actor": "ROT",
          "combat_effect": "HEAVY_DOT",
          "balance_status": "APPROVED",
          "power_coefficient": 1.75,
          "drawback": "자신도 삭는다."
        },
        {
          "pair": [
            "WASH",
            "WASH"
          ],
          "result_class": "EMPTIED",
          "actor": "WASH",
          "combat_effect": "CLEAR_ALL_STATES",
          "balance_status": "APPROVED",
          "power_coefficient": 1,
          "drawback": "아군 버프도 제거한다."
        },
        {
          "pair": [
            "JOIN",
            "JOIN"
          ],
          "result_class": "KNOT",
          "actor": "JOIN",
          "combat_effect": "DOUBLE_FORGE",
          "balance_status": "APPROVED",
          "power_coefficient": 1,
          "drawback": "그 턴에는 다른 행동을 할 수 없다."
        }
      ],
      "resultClasses": [
        {
          "id": "PRESSED_FIRE",
          "family": "CROSS",
          "density": "MID",
          "density_status": "APPROVED",
          "combat_effect": "DELAYED_EXPLOSION"
        },
        {
          "id": "SETTLING",
          "family": "CROSS",
          "density": "MID",
          "density_status": "APPROVED",
          "combat_effect": "SLOW_TARGET"
        },
        {
          "id": "SCAB",
          "family": "CROSS",
          "density": "DENSE",
          "density_status": "APPROVED",
          "combat_effect": "EXTEND_DOT"
        },
        {
          "id": "CRYSTAL",
          "family": "CROSS",
          "density": "DENSE",
          "density_status": "APPROVED",
          "combat_effect": "PERMANENT_BLOCK"
        },
        {
          "id": "HARDENED",
          "family": "CROSS",
          "density": "MID",
          "density_status": "APPROVED",
          "combat_effect": "AMPLIFY_STILL"
        },
        {
          "id": "BLAST",
          "family": "CROSS",
          "density": "DENSE",
          "density_status": "APPROVED",
          "combat_effect": "BURST_AOE"
        },
        {
          "id": "INCINERATION",
          "family": "CROSS",
          "density": "MID",
          "density_status": "APPROVED",
          "combat_effect": "EXILE_AND_DAMAGE"
        },
        {
          "id": "SEARING",
          "family": "CROSS",
          "density": "MID",
          "density_status": "APPROVED",
          "combat_effect": "DEBUFF_TO_DAMAGE"
        },
        {
          "id": "KINDLED",
          "family": "CROSS",
          "density": "DENSE",
          "density_status": "APPROVED",
          "combat_effect": "AMPLIFY_BURN"
        },
        {
          "id": "SPREADING",
          "family": "CROSS",
          "density": "SPARSE",
          "density_status": "APPROVED",
          "combat_effect": "SPREAD_DEBUFF"
        },
        {
          "id": "VANISHING",
          "family": "CROSS",
          "density": "SPARSE",
          "density_status": "APPROVED",
          "combat_effect": "EXILE"
        },
        {
          "id": "QUICKENED",
          "family": "CROSS",
          "density": "SPARSE",
          "density_status": "APPROVED",
          "combat_effect": "AMPLIFY_SCATTER"
        },
        {
          "id": "NEUTRALIZED",
          "family": "CROSS",
          "density": "MID",
          "density_status": "APPROVED",
          "combat_effect": "RESET_STATES"
        },
        {
          "id": "FESTERED",
          "family": "CROSS",
          "density": "DENSE",
          "density_status": "APPROVED",
          "combat_effect": "AMPLIFY_ROT"
        },
        {
          "id": "CLARIFIED",
          "family": "CROSS",
          "density": "SPARSE",
          "density_status": "APPROVED",
          "combat_effect": "AMPLIFY_WASH"
        },
        {
          "id": "TOTAL_STOP",
          "family": "SAME",
          "density": "MAX",
          "density_status": "APPROVED",
          "combat_effect": "MASSIVE_BLOCK"
        },
        {
          "id": "BURNOUT",
          "family": "SAME",
          "density": "MAX",
          "density_status": "APPROVED",
          "combat_effect": "MAX_DAMAGE"
        },
        {
          "id": "DISPERSAL",
          "family": "SAME",
          "density": "MIN",
          "density_status": "APPROVED",
          "combat_effect": "MAX_EVASION"
        },
        {
          "id": "SELF_EATING",
          "family": "SAME",
          "density": "MAX",
          "density_status": "APPROVED",
          "combat_effect": "HEAVY_DOT"
        },
        {
          "id": "EMPTIED",
          "family": "SAME",
          "density": "MIN",
          "density_status": "APPROVED",
          "combat_effect": "CLEAR_ALL_STATES"
        },
        {
          "id": "KNOT",
          "family": "SAME",
          "density": "MAX",
          "density_status": "APPROVED",
          "combat_effect": "DOUBLE_FORGE"
        },
        {
          "id": "CATALYZED_STILL",
          "family": "CATALYST",
          "density": null,
          "density_status": "DERIVED_FROM_MATERIAL",
          "combat_effect": "AMPLIFY_STILL"
        },
        {
          "id": "CATALYZED_BURN",
          "family": "CATALYST",
          "density": null,
          "density_status": "DERIVED_FROM_MATERIAL",
          "combat_effect": "AMPLIFY_BURN"
        },
        {
          "id": "CATALYZED_SCATTER",
          "family": "CATALYST",
          "density": null,
          "density_status": "DERIVED_FROM_MATERIAL",
          "combat_effect": "AMPLIFY_SCATTER"
        },
        {
          "id": "CATALYZED_ROT",
          "family": "CATALYST",
          "density": null,
          "density_status": "DERIVED_FROM_MATERIAL",
          "combat_effect": "AMPLIFY_ROT"
        },
        {
          "id": "CATALYZED_WASH",
          "family": "CATALYST",
          "density": null,
          "density_status": "DERIVED_FROM_MATERIAL",
          "combat_effect": "AMPLIFY_WASH"
        },
        {
          "id": "CATALYZED_JOIN",
          "family": "CATALYST",
          "density": null,
          "density_status": "DERIVED_FROM_MATERIAL",
          "combat_effect": "DOUBLE_FORGE"
        },
        {
          "id": "EQUIPMENT",
          "family": "EQUIPMENT",
          "density": "DENSE",
          "density_status": "APPROVED",
          "combat_effect": null,
          "equipment_interactions": [
            {
              "domains": [
                "FORGE",
                "HAND"
              ],
              "passive_effect_id": "EQUIPMENT_FORGE_HAND",
              "passive_effect_ko": "빚기 후 드로우"
            },
            {
              "domains": [
                "FORGE",
                "DECK"
              ],
              "passive_effect_id": "EQUIPMENT_FORGE_DECK",
              "passive_effect_ko": "빚기 시 덱 정리"
            },
            {
              "domains": [
                "FORGE",
                "INFO"
              ],
              "passive_effect_id": "EQUIPMENT_FORGE_INFO",
              "passive_effect_ko": "결과 미리보기"
            },
            {
              "domains": [
                "FORGE",
                "SCALE"
              ],
              "passive_effect_id": "EQUIPMENT_FORGE_SCALE",
              "passive_effect_ko": "빚기 결과 증폭"
            },
            {
              "domains": [
                "FORGE",
                "ENERGY"
              ],
              "passive_effect_id": "EQUIPMENT_FORGE_ENERGY",
              "passive_effect_ko": "빚기 비용 감소"
            },
            {
              "domains": [
                "FORGE",
                "BALANCE"
              ],
              "passive_effect_id": "EQUIPMENT_FORGE_BALANCE",
              "passive_effect_ko": "속성 균형 시 빚기 강화"
            },
            {
              "domains": [
                "FORGE",
                "KEEP"
              ],
              "passive_effect_id": "EQUIPMENT_FORGE_KEEP",
              "passive_effect_ko": "즉석 결과 1장 유지"
            },
            {
              "domains": [
                "FORGE",
                "ROUTE"
              ],
              "passive_effect_id": "EQUIPMENT_FORGE_ROUTE",
              "passive_effect_ko": "터마다 빚기 1회 무료"
            },
            {
              "domains": [
                "FORGE",
                "CARRY"
              ],
              "passive_effect_id": "EQUIPMENT_FORGE_CARRY",
              "passive_effect_ko": "재료 추가 획득"
            },
            {
              "domains": [
                "HAND",
                "DECK"
              ],
              "passive_effect_id": "EQUIPMENT_HAND_DECK",
              "passive_effect_ko": "드로우 후 덱 정리"
            },
            {
              "domains": [
                "HAND",
                "INFO"
              ],
              "passive_effect_id": "EQUIPMENT_HAND_INFO",
              "passive_effect_ko": "드로우 전 확인"
            },
            {
              "domains": [
                "HAND",
                "SCALE"
              ],
              "passive_effect_id": "EQUIPMENT_HAND_SCALE",
              "passive_effect_ko": "손패 수만큼 증폭"
            },
            {
              "domains": [
                "HAND",
                "ENERGY"
              ],
              "passive_effect_id": "EQUIPMENT_HAND_ENERGY",
              "passive_effect_ko": "드로우 시 에너지"
            },
            {
              "domains": [
                "HAND",
                "BALANCE"
              ],
              "passive_effect_id": "EQUIPMENT_HAND_BALANCE",
              "passive_effect_ko": "손패 균형 보상"
            },
            {
              "domains": [
                "HAND",
                "KEEP"
              ],
              "passive_effect_id": "EQUIPMENT_HAND_KEEP",
              "passive_effect_ko": "손패 1장 이월"
            },
            {
              "domains": [
                "HAND",
                "ROUTE"
              ],
              "passive_effect_id": "EQUIPMENT_HAND_ROUTE",
              "passive_effect_ko": "경로 선택지 증가"
            },
            {
              "domains": [
                "HAND",
                "CARRY"
              ],
              "passive_effect_id": "EQUIPMENT_HAND_CARRY",
              "passive_effect_ko": "손패 한도 증가"
            },
            {
              "domains": [
                "DECK",
                "INFO"
              ],
              "passive_effect_id": "EQUIPMENT_DECK_INFO",
              "passive_effect_ko": "덱 상단 공개"
            },
            {
              "domains": [
                "DECK",
                "SCALE"
              ],
              "passive_effect_id": "EQUIPMENT_DECK_SCALE",
              "passive_effect_ko": "얇을수록 증폭"
            },
            {
              "domains": [
                "DECK",
                "ENERGY"
              ],
              "passive_effect_id": "EQUIPMENT_DECK_ENERGY",
              "passive_effect_ko": "카드 제거 시 에너지"
            },
            {
              "domains": [
                "DECK",
                "BALANCE"
              ],
              "passive_effect_id": "EQUIPMENT_DECK_BALANCE",
              "passive_effect_ko": "덱 속성 균형 보상"
            },
            {
              "domains": [
                "DECK",
                "KEEP"
              ],
              "passive_effect_id": "EQUIPMENT_DECK_KEEP",
              "passive_effect_ko": "제거 카드 보관"
            },
            {
              "domains": [
                "DECK",
                "ROUTE"
              ],
              "passive_effect_id": "EQUIPMENT_DECK_ROUTE",
              "passive_effect_ko": "덱 정리 보상"
            },
            {
              "domains": [
                "DECK",
                "CARRY"
              ],
              "passive_effect_id": "EQUIPMENT_DECK_CARRY",
              "passive_effect_ko": "획득 시 자동 정리"
            },
            {
              "domains": [
                "INFO",
                "SCALE"
              ],
              "passive_effect_id": "EQUIPMENT_INFO_SCALE",
              "passive_effect_ko": "적 수치 공개"
            },
            {
              "domains": [
                "INFO",
                "ENERGY"
              ],
              "passive_effect_id": "EQUIPMENT_INFO_ENERGY",
              "passive_effect_ko": "정보 획득 시 에너지"
            },
            {
              "domains": [
                "INFO",
                "BALANCE"
              ],
              "passive_effect_id": "EQUIPMENT_INFO_BALANCE",
              "passive_effect_ko": "적 속성 공개"
            },
            {
              "domains": [
                "INFO",
                "KEEP"
              ],
              "passive_effect_id": "EQUIPMENT_INFO_KEEP",
              "passive_effect_ko": "본 카드 예약"
            },
            {
              "domains": [
                "INFO",
                "ROUTE"
              ],
              "passive_effect_id": "EQUIPMENT_INFO_ROUTE",
              "passive_effect_ko": "다음 터 미리보기"
            },
            {
              "domains": [
                "INFO",
                "CARRY"
              ],
              "passive_effect_id": "EQUIPMENT_INFO_CARRY",
              "passive_effect_ko": "숨은 재료 발견"
            },
            {
              "domains": [
                "SCALE",
                "ENERGY"
              ],
              "passive_effect_id": "EQUIPMENT_SCALE_ENERGY",
              "passive_effect_ko": "에너지당 증폭"
            },
            {
              "domains": [
                "SCALE",
                "BALANCE"
              ],
              "passive_effect_id": "EQUIPMENT_SCALE_BALANCE",
              "passive_effect_ko": "균형 시 증폭"
            },
            {
              "domains": [
                "SCALE",
                "KEEP"
              ],
              "passive_effect_id": "EQUIPMENT_SCALE_KEEP",
              "passive_effect_ko": "증폭 상태 이월"
            },
            {
              "domains": [
                "SCALE",
                "ROUTE"
              ],
              "passive_effect_id": "EQUIPMENT_SCALE_ROUTE",
              "passive_effect_ko": "고심도 보상 증가"
            },
            {
              "domains": [
                "SCALE",
                "CARRY"
              ],
              "passive_effect_id": "EQUIPMENT_SCALE_CARRY",
              "passive_effect_ko": "획득량 증폭"
            },
            {
              "domains": [
                "ENERGY",
                "BALANCE"
              ],
              "passive_effect_id": "EQUIPMENT_ENERGY_BALANCE",
              "passive_effect_ko": "균형 시 에너지"
            },
            {
              "domains": [
                "ENERGY",
                "KEEP"
              ],
              "passive_effect_id": "EQUIPMENT_ENERGY_KEEP",
              "passive_effect_ko": "잔여 에너지 이월"
            },
            {
              "domains": [
                "ENERGY",
                "ROUTE"
              ],
              "passive_effect_id": "EQUIPMENT_ENERGY_ROUTE",
              "passive_effect_ko": "터 진입 시 에너지"
            },
            {
              "domains": [
                "ENERGY",
                "CARRY"
              ],
              "passive_effect_id": "EQUIPMENT_ENERGY_CARRY",
              "passive_effect_ko": "운반량만큼 에너지"
            },
            {
              "domains": [
                "BALANCE",
                "KEEP"
              ],
              "passive_effect_id": "EQUIPMENT_BALANCE_KEEP",
              "passive_effect_ko": "균형 상태 이월"
            },
            {
              "domains": [
                "BALANCE",
                "ROUTE"
              ],
              "passive_effect_id": "EQUIPMENT_BALANCE_ROUTE",
              "passive_effect_ko": "균형 시 경로 추가"
            },
            {
              "domains": [
                "BALANCE",
                "CARRY"
              ],
              "passive_effect_id": "EQUIPMENT_BALANCE_CARRY",
              "passive_effect_ko": "균등 획득"
            },
            {
              "domains": [
                "KEEP",
                "ROUTE"
              ],
              "passive_effect_id": "EQUIPMENT_KEEP_ROUTE",
              "passive_effect_ko": "터 간 이월"
            },
            {
              "domains": [
                "KEEP",
                "CARRY"
              ],
              "passive_effect_id": "EQUIPMENT_KEEP_CARRY",
              "passive_effect_ko": "보관 한도 증가"
            },
            {
              "domains": [
                "ROUTE",
                "CARRY"
              ],
              "passive_effect_id": "EQUIPMENT_ROUTE_CARRY",
              "passive_effect_ko": "경로별 재료 표시"
            }
          ]
        },
        {
          "id": "HEART_STILL",
          "family": "HEART",
          "density": "MAX",
          "density_status": "APPROVED",
          "combat_effect": null
        },
        {
          "id": "HEART_BURN",
          "family": "HEART",
          "density": "MAX",
          "density_status": "APPROVED",
          "combat_effect": null
        },
        {
          "id": "HEART_SCATTER",
          "family": "HEART",
          "density": "MAX",
          "density_status": "APPROVED",
          "combat_effect": null
        },
        {
          "id": "HEART_ROT",
          "family": "HEART",
          "density": "MAX",
          "density_status": "APPROVED",
          "combat_effect": null
        },
        {
          "id": "HEART_WASH",
          "family": "HEART",
          "density": "MAX",
          "density_status": "APPROVED",
          "combat_effect": null
        },
        {
          "id": "HEART_JOIN",
          "family": "HEART",
          "density": "MAX",
          "density_status": "APPROVED",
          "combat_effect": null
        }
      ],
      "tuning": {
        "SAME_BONUS": 1,
        "COST_DIVISOR": 3
      }
    }
  },
  "materialDisplay": [
    {
      "id": "ore_still",
      "nameKo": "굳은 조각",
      "art": "cards/ore_still.png",
      "category": "ORE",
      "attribute": "STILL"
    },
    {
      "id": "ore_burn",
      "nameKo": "타는 조각",
      "art": "cards/ore_burn.png",
      "category": "ORE",
      "attribute": "BURN"
    },
    {
      "id": "ore_scatter",
      "nameKo": "흩어지는 조각",
      "art": "cards/ore_scatter.png",
      "category": "ORE",
      "attribute": "SCATTER"
    },
    {
      "id": "ore_rot",
      "nameKo": "삭은 조각",
      "art": "cards/ore_rot.png",
      "category": "ORE",
      "attribute": "ROT"
    },
    {
      "id": "ore_wash",
      "nameKo": "씻긴 조각",
      "art": "cards/ore_wash.png",
      "category": "ORE",
      "attribute": "WASH"
    },
    {
      "id": "ore_join",
      "nameKo": "엉긴 조각",
      "art": "cards/ore_join.png",
      "category": "ORE",
      "attribute": "JOIN"
    },
    {
      "id": "still_01",
      "nameKo": "서리꽃",
      "art": "cards/still_01.png",
      "category": "GROUND_PRODUCT",
      "attribute": "STILL"
    },
    {
      "id": "still_02",
      "nameKo": "멈춘 물방울",
      "art": "cards/still_02.png",
      "category": "GROUND_PRODUCT",
      "attribute": "STILL"
    },
    {
      "id": "still_03",
      "nameKo": "잠긴 발자국",
      "art": "cards/still_03.png",
      "category": "GROUND_PRODUCT",
      "attribute": "STILL"
    },
    {
      "id": "still_04",
      "nameKo": "굳은 숨",
      "art": "cards/still_04.png",
      "category": "GROUND_PRODUCT",
      "attribute": "STILL"
    },
    {
      "id": "still_05",
      "nameKo": "그친 종소리",
      "art": "cards/still_05.png",
      "category": "GROUND_PRODUCT",
      "attribute": "STILL"
    },
    {
      "id": "burn_01",
      "nameKo": "잉걸",
      "art": "cards/burn_01.png",
      "category": "GROUND_PRODUCT",
      "attribute": "BURN"
    },
    {
      "id": "burn_02",
      "nameKo": "꺼진 심지",
      "art": "cards/burn_02.png",
      "category": "GROUND_PRODUCT",
      "attribute": "BURN"
    },
    {
      "id": "burn_03",
      "nameKo": "눌어붙은 재",
      "art": "cards/burn_03.png",
      "category": "GROUND_PRODUCT",
      "attribute": "BURN"
    },
    {
      "id": "burn_04",
      "nameKo": "남은 열",
      "art": "cards/burn_04.png",
      "category": "GROUND_PRODUCT",
      "attribute": "BURN"
    },
    {
      "id": "burn_05",
      "nameKo": "첫 불티",
      "art": "cards/burn_05.png",
      "category": "GROUND_PRODUCT",
      "attribute": "BURN"
    },
    {
      "id": "scat_01",
      "nameKo": "가벼운 뼈",
      "art": "cards/scat_01.png",
      "category": "GROUND_PRODUCT",
      "attribute": "SCATTER"
    },
    {
      "id": "scat_02",
      "nameKo": "흩날리는 씨",
      "art": "cards/scat_02.png",
      "category": "GROUND_PRODUCT",
      "attribute": "SCATTER"
    },
    {
      "id": "scat_03",
      "nameKo": "벗겨진 껍데기",
      "art": "cards/scat_03.png",
      "category": "GROUND_PRODUCT",
      "attribute": "SCATTER"
    },
    {
      "id": "scat_04",
      "nameKo": "뜬 먼지",
      "art": "cards/scat_04.png",
      "category": "GROUND_PRODUCT",
      "attribute": "SCATTER"
    },
    {
      "id": "scat_05",
      "nameKo": "마른 바람",
      "art": "cards/scat_05.png",
      "category": "GROUND_PRODUCT",
      "attribute": "SCATTER"
    },
    {
      "id": "rot_01",
      "nameKo": "딱지",
      "art": "cards/rot_01.png",
      "category": "GROUND_PRODUCT",
      "attribute": "ROT"
    },
    {
      "id": "rot_02",
      "nameKo": "무른 뿌리",
      "art": "cards/rot_02.png",
      "category": "GROUND_PRODUCT",
      "attribute": "ROT"
    },
    {
      "id": "rot_03",
      "nameKo": "곰팡이 꽃",
      "art": "cards/rot_03.png",
      "category": "GROUND_PRODUCT",
      "attribute": "ROT"
    },
    {
      "id": "rot_04",
      "nameKo": "번지는 얼룩",
      "art": "cards/rot_04.png",
      "category": "GROUND_PRODUCT",
      "attribute": "ROT"
    },
    {
      "id": "rot_05",
      "nameKo": "내려앉은 냄새",
      "art": "cards/rot_05.png",
      "category": "GROUND_PRODUCT",
      "attribute": "ROT"
    },
    {
      "id": "wash_01",
      "nameKo": "맑은 눈물",
      "art": "cards/wash_01.png",
      "category": "GROUND_PRODUCT",
      "attribute": "WASH"
    },
    {
      "id": "wash_02",
      "nameKo": "닳은 돌",
      "art": "cards/wash_02.png",
      "category": "GROUND_PRODUCT",
      "attribute": "WASH"
    },
    {
      "id": "wash_03",
      "nameKo": "빈 껍질",
      "art": "cards/wash_03.png",
      "category": "GROUND_PRODUCT",
      "attribute": "WASH"
    },
    {
      "id": "wash_04",
      "nameKo": "지워진 자국",
      "art": "cards/wash_04.png",
      "category": "GROUND_PRODUCT",
      "attribute": "WASH"
    },
    {
      "id": "wash_05",
      "nameKo": "가라앉은 앙금",
      "art": "cards/wash_05.png",
      "category": "GROUND_PRODUCT",
      "attribute": "WASH"
    },
    {
      "id": "join_01",
      "nameKo": "엉킨 실",
      "art": "cards/join_01.png",
      "category": "GROUND_PRODUCT",
      "attribute": "JOIN"
    },
    {
      "id": "join_02",
      "nameKo": "붙은 손",
      "art": "cards/join_02.png",
      "category": "GROUND_PRODUCT",
      "attribute": "JOIN"
    },
    {
      "id": "join_03",
      "nameKo": "자란 매듭",
      "art": "cards/join_03.png",
      "category": "GROUND_PRODUCT",
      "attribute": "JOIN"
    },
    {
      "id": "join_04",
      "nameKo": "이어진 그림자",
      "art": "cards/join_04.png",
      "category": "GROUND_PRODUCT",
      "attribute": "JOIN"
    },
    {
      "id": "join_05",
      "nameKo": "겹친 소리",
      "art": "cards/join_05.png",
      "category": "GROUND_PRODUCT",
      "attribute": "JOIN"
    },
    {
      "id": "tool_01",
      "nameKo": "도가니",
      "art": "cards/tool_01.png",
      "category": "TOOL",
      "attribute": "NONE"
    },
    {
      "id": "tool_02",
      "nameKo": "집게",
      "art": "cards/tool_02.png",
      "category": "TOOL",
      "attribute": "NONE"
    },
    {
      "id": "tool_03",
      "nameKo": "체",
      "art": "cards/tool_03.png",
      "category": "TOOL",
      "attribute": "NONE"
    },
    {
      "id": "tool_04",
      "nameKo": "등불",
      "art": "cards/tool_04.png",
      "category": "TOOL",
      "attribute": "NONE"
    },
    {
      "id": "tool_05",
      "nameKo": "계측기",
      "art": "cards/tool_05.png",
      "category": "TOOL",
      "attribute": "NONE"
    },
    {
      "id": "tool_06",
      "nameKo": "풀무",
      "art": "cards/tool_06.png",
      "category": "TOOL",
      "attribute": "NONE"
    },
    {
      "id": "tool_07",
      "nameKo": "저울",
      "art": "cards/tool_07.png",
      "category": "TOOL",
      "attribute": "NONE"
    },
    {
      "id": "tool_08",
      "nameKo": "표본 상자",
      "art": "cards/tool_08.png",
      "category": "TOOL",
      "attribute": "NONE"
    },
    {
      "id": "tool_09",
      "nameKo": "갱도 지도",
      "art": "cards/tool_09.png",
      "category": "TOOL",
      "attribute": "NONE"
    },
    {
      "id": "tool_10",
      "nameKo": "손수레",
      "art": "cards/tool_10.png",
      "category": "TOOL",
      "attribute": "NONE"
    },
    {
      "id": "odd_01",
      "nameKo": "걸어다니는 주전자",
      "art": "cards/odd_01.png",
      "category": "ODDITY",
      "attribute": [
        "JOIN",
        "SCATTER"
      ]
    },
    {
      "id": "odd_02",
      "nameKo": "두 번 접힌 사다리",
      "art": "cards/odd_02.png",
      "category": "ODDITY",
      "attribute": [
        "STILL",
        "JOIN"
      ]
    },
    {
      "id": "odd_03",
      "nameKo": "스스로 켜지는 초",
      "art": "cards/odd_03.png",
      "category": "ODDITY",
      "attribute": [
        "BURN",
        "JOIN"
      ]
    },
    {
      "id": "odd_04",
      "nameKo": "뒤집힌 장갑",
      "art": "cards/odd_04.png",
      "category": "ODDITY",
      "attribute": [
        "WASH",
        "SCATTER"
      ]
    },
    {
      "id": "odd_05",
      "nameKo": "노래하는 못",
      "art": "cards/odd_05.png",
      "category": "ODDITY",
      "attribute": [
        "JOIN",
        "WASH"
      ]
    },
    {
      "id": "odd_06",
      "nameKo": "자기를 재는 자",
      "art": "cards/odd_06.png",
      "category": "ODDITY",
      "attribute": [
        "ROT",
        "STILL"
      ]
    }
  ]
};
