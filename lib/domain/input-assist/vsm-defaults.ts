// 攻撃コンビ(32)とセッターコール(18)の一覧。昨シーズン('26秋季リーグ.vsdb)の 2026-10-24 國學院大學戦で
// 田中が手直しした版(P1・P5・PA に始まりのサブゾーンを足したもの)を写した。
// 今シーズンの vsdb(2027上半期)は選手の名前だけ登録されていて、攻撃コンビ・セッターコールは手直しの前のままなので、
// 書き出しではいつもこの一覧を使う(林の指示、2026-11-10)。

export const DEFAULT_ATTACK_COMBINATIONS: unknown[] = [
  {
    "_id": "6ab205c053bff724cc21194c",
    "code": "P1",
    "name": "Highset zone4",
    "hitType": "H",
    "targetAttacker": "F",
    "notes": "",
    "start": {
      "zone": 4,
      "subZone": "C"
    }
  },
  {
    "_id": "5fe17c551a073d29e4f96efb",
    "code": "P2",
    "name": "Highset Short zone4",
    "hitType": "H",
    "targetAttacker": "F",
    "start": {
      "zone": 4
    }
  },
  {
    "_id": "5fe17c9c1a073d29e4f96efe",
    "code": "P3",
    "name": "Highset zone3",
    "hitType": "H",
    "targetAttacker": "C",
    "start": {
      "zone": 3
    }
  },
  {
    "_id": "5fe17c8c1a073d29e4f96efd",
    "code": "P4",
    "name": "Highset Short zone2",
    "hitType": "H",
    "targetAttacker": "B",
    "start": {
      "zone": 2
    }
  },
  {
    "_id": "6ab205cc53bff724cc21194d",
    "code": "P5",
    "name": "Highset zone2",
    "hitType": "H",
    "targetAttacker": "F",
    "start": {
      "zone": 2,
      "subZone": "B"
    }
  },
  {
    "_id": "5fe17cfe1a073d29e4f96f06",
    "code": "P7",
    "name": "Backrow zone7",
    "hitType": "U",
    "targetAttacker": "F",
    "start": {
      "zone": 7
    }
  },
  {
    "_id": "5fe17d191a073d29e4f96f07",
    "code": "P8",
    "name": "Backrow zone8",
    "hitType": "U",
    "targetAttacker": "P",
    "start": {
      "zone": 8
    }
  },
  {
    "_id": "5fe17d301a073d29e4f96f08",
    "code": "P9",
    "name": "Backrow zone9",
    "hitType": "U",
    "targetAttacker": "B",
    "start": {
      "zone": 9
    }
  },
  {
    "_id": "6ab205d453bff724cc21194e",
    "code": "PA",
    "name": "A",
    "hitType": "Q",
    "targetAttacker": "C",
    "start": {
      "zone": 3,
      "subZone": "C"
    }
  },
  {
    "_id": "5fe17db31a073d29e4f96f0a",
    "code": "PB",
    "name": "B",
    "hitType": "Q",
    "targetAttacker": "C",
    "start": {
      "zone": 3
    }
  },
  {
    "_id": "5fe17dc21a073d29e4f96f0b",
    "code": "PC",
    "name": "C",
    "hitType": "Q",
    "targetAttacker": "C",
    "start": {
      "zone": 3
    }
  },
  {
    "_id": "5fe17de31a073d29e4f96f0c",
    "code": "PD",
    "name": "D",
    "hitType": "Q",
    "targetAttacker": "C",
    "start": {
      "zone": 2
    }
  },
  {
    "_id": "5fe17dfc1a073d29e4f96f0d",
    "code": "PG",
    "name": "Backrow zone 7-8",
    "hitType": "U",
    "targetAttacker": "P",
    "start": {
      "zone": 8
    }
  },
  {
    "_id": "5fe17e131a073d29e4f96f0e",
    "code": "PH",
    "name": "Backrow zone 8-9",
    "hitType": "U",
    "targetAttacker": "P",
    "start": {
      "zone": 8
    }
  },
  {
    "_id": "5fe17e2b1a073d29e4f96f0f",
    "code": "PK",
    "name": "Right Oneleg",
    "hitType": "M",
    "targetAttacker": "B",
    "start": {
      "zone": 2
    }
  },
  {
    "_id": "5fe17e741a073d29e4f96f10",
    "code": "PL",
    "name": "Oneleg-Long",
    "hitType": "N",
    "targetAttacker": "B",
    "start": {
      "zone": 2
    }
  },
  {
    "_id": "5fe17e941a073d29e4f96f11",
    "code": "PR",
    "name": "Oneleg-Medium",
    "hitType": "N",
    "targetAttacker": "B",
    "start": {
      "zone": 2
    }
  },
  {
    "_id": "5fe17eaa1a073d29e4f96f12",
    "code": "PO",
    "name": "Oneleg-Short",
    "hitType": "N",
    "targetAttacker": "C",
    "start": {
      "zone": 3
    }
  },
  {
    "_id": "5fe17ee41a073d29e4f96f13",
    "code": "PP",
    "name": "Direct- Overpass",
    "hitType": "O",
    "start": {
      "zone": 3
    }
  },
  {
    "_id": "5fe17f011a073d29e4f96f14",
    "code": "PQ",
    "name": "Gap",
    "hitType": "Q",
    "targetAttacker": "C",
    "start": {
      "zone": 3
    }
  },
  {
    "_id": "5fe17f1b1a073d29e4f96f15",
    "code": "PS",
    "name": "Setter Attack",
    "hitType": "O",
    "targetAttacker": "S",
    "start": {
      "zone": 3
    }
  },
  {
    "_id": "5fe17f401a073d29e4f96f16",
    "code": "PT",
    "name": "Fake",
    "hitType": "T",
    "targetAttacker": "C",
    "start": {
      "zone": 3
    }
  },
  {
    "_id": "69c4ebc7cbe774022c40d625",
    "code": "PV",
    "name": "Zone4",
    "hitType": "M",
    "targetAttacker": "F",
    "start": {
      "zone": 4,
      "subZone": "C"
    }
  },
  {
    "_id": "5fe17ff31a073d29e4f96f1b",
    "code": "PW",
    "name": "Cut in zone4",
    "hitType": "T",
    "targetAttacker": "F",
    "start": {
      "zone": 4
    }
  },
  {
    "_id": "5fe180381a073d29e4f96f4f",
    "code": "PX",
    "name": "Semi",
    "hitType": "T",
    "targetAttacker": "C",
    "start": {
      "zone": 3
    }
  },
  {
    "_id": "5fe180541a073d29e4f96f50",
    "code": "PY",
    "name": "Cut in zone2",
    "hitType": "T",
    "targetAttacker": "B",
    "start": {
      "zone": 2
    }
  },
  {
    "_id": "69c4ebd6cbe774022c40d626",
    "code": "PZ",
    "name": "Zone2",
    "hitType": "M",
    "targetAttacker": "B",
    "start": {
      "zone": 2,
      "subZone": "B"
    }
  },
  {
    "_id": "5fe181031a073d29e4f96f70",
    "code": "P0",
    "name": "Backrow Highset zone8",
    "hitType": "H",
    "targetAttacker": "P",
    "start": {
      "zone": 8
    }
  },
  {
    "_id": "5fe180f91a073d29e4f96f6f",
    "code": "P6",
    "name": "Backrow Highset zone9",
    "hitType": "H",
    "targetAttacker": "B",
    "start": {
      "zone": 9
    }
  },
  {
    "_id": "5fe182f41a073d29e4f96fa3",
    "code": "PU",
    "name": "Short zone4",
    "hitType": "M",
    "targetAttacker": "F",
    "start": {
      "zone": 4
    }
  },
  {
    "_id": "5fe1813e1a073d29e4f96f72",
    "code": "PI",
    "name": "Short zone2",
    "hitType": "M",
    "targetAttacker": "B",
    "start": {
      "zone": 2
    }
  },
  {
    "_id": "5fe181661a073d29e4f96f73",
    "code": "PE",
    "name": "Self-Semi2",
    "hitType": "T",
    "targetAttacker": "C",
    "start": {
      "zone": 3
    }
  }
];

export const DEFAULT_SETTER_CALLS: unknown[] = [
  {
    "_id": "5fe181b11a073d29e4f96f90",
    "code": "KA",
    "name": "A",
    "area": [
      {
        "zone": 3,
        "subZone": "C"
      }
    ]
  },
  {
    "_id": "5fe181b81a073d29e4f96f91",
    "code": "KB",
    "name": "B",
    "area": [
      {
        "zone": 3,
        "subZone": "C"
      }
    ]
  },
  {
    "_id": "5fe181be1a073d29e4f96f92",
    "code": "KC",
    "name": "C",
    "area": [
      {
        "zone": 3,
        "subZone": "B"
      }
    ]
  },
  {
    "_id": "5fe181ca1a073d29e4f96f93",
    "code": "KD",
    "name": "D",
    "area": [
      {
        "zone": 2,
        "subZone": "C"
      }
    ]
  },
  {
    "_id": "5fe181d51a073d29e4f96f94",
    "code": "KQ",
    "name": "Gap",
    "area": [
      {
        "zone": 3,
        "subZone": "C"
      }
    ]
  },
  {
    "_id": "5fe181f71a073d29e4f96f95",
    "code": "KO",
    "name": "PO",
    "area": [
      {
        "zone": 3,
        "subZone": "B"
      }
    ]
  },
  {
    "_id": "5fe182021a073d29e4f96f96",
    "code": "KR",
    "name": "PR",
    "area": [
      {
        "zone": 3,
        "subZone": "B"
      }
    ]
  },
  {
    "_id": "5fe182141a073d29e4f96f98",
    "code": "KL",
    "name": "PL",
    "area": []
  },
  {
    "_id": "5fe182341a073d29e4f96f99",
    "code": "KK",
    "name": "Underhand-set",
    "area": [
      {
        "zone": 8,
        "subZone": "A"
      },
      {
        "zone": 8,
        "subZone": "D"
      },
      {
        "zone": 8,
        "subZone": "C"
      },
      {
        "zone": 8,
        "subZone": "B"
      }
    ]
  },
  {
    "_id": "5fe1824f1a073d29e4f96f9a",
    "code": "K2",
    "name": "zone2",
    "area": [
      {
        "zone": 2,
        "subZone": "A"
      },
      {
        "zone": 2,
        "subZone": "D"
      },
      {
        "zone": 2,
        "subZone": "C"
      },
      {
        "zone": 2,
        "subZone": "B"
      }
    ]
  },
  {
    "_id": "5fe1825e1a073d29e4f96f9b",
    "code": "K3",
    "name": "zone3 High",
    "area": [
      {
        "zone": 3,
        "subZone": "C"
      },
      {
        "zone": 3,
        "subZone": "B"
      }
    ]
  },
  {
    "_id": "5fe1826c1a073d29e4f96f9c",
    "code": "K4",
    "name": "zone4",
    "area": [
      {
        "zone": 4,
        "subZone": "B"
      },
      {
        "zone": 4,
        "subZone": "C"
      },
      {
        "zone": 4,
        "subZone": "D"
      },
      {
        "zone": 4,
        "subZone": "A"
      }
    ]
  },
  {
    "_id": "5fe1827f1a073d29e4f96f9d",
    "code": "K7",
    "name": "zone7",
    "area": [
      {
        "zone": 7,
        "subZone": "B"
      },
      {
        "zone": 7,
        "subZone": "C"
      },
      {
        "zone": 7,
        "subZone": "D"
      },
      {
        "zone": 7,
        "subZone": "A"
      }
    ]
  },
  {
    "_id": "5fe1828b1a073d29e4f96f9e",
    "code": "K8",
    "name": "Zone8",
    "area": [
      {
        "zone": 8,
        "subZone": "B"
      },
      {
        "zone": 8,
        "subZone": "C"
      },
      {
        "zone": 8,
        "subZone": "D"
      },
      {
        "zone": 8,
        "subZone": "A"
      }
    ]
  },
  {
    "_id": "5fe182931a073d29e4f96f9f",
    "code": "K9",
    "name": "Zone9",
    "area": [
      {
        "zone": 9,
        "subZone": "C"
      },
      {
        "zone": 9,
        "subZone": "B"
      },
      {
        "zone": 9,
        "subZone": "A"
      },
      {
        "zone": 9,
        "subZone": "D"
      }
    ]
  },
  {
    "_id": "5fe182a11a073d29e4f96fa0",
    "code": "KV",
    "name": "MB-PV",
    "area": [
      {
        "zone": 4,
        "subZone": "C"
      }
    ]
  },
  {
    "_id": "5fe182ad1a073d29e4f96fa1",
    "code": "KZ",
    "name": "MB-PZ",
    "area": [
      {
        "zone": 2,
        "subZone": "B"
      }
    ]
  },
  {
    "_id": "5fe182d61a073d29e4f96fa2",
    "code": "K6",
    "name": "Zone3-Low",
    "area": [
      {
        "zone": 3,
        "subZone": "D"
      },
      {
        "zone": 3,
        "subZone": "A"
      }
    ]
  }
];
