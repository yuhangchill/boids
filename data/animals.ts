// The candidate creature set.
//
// A broad, natural list of common animals, deliberately UNfiltered: no exclusion
// rule, no forced category diversity, no recognizability weighting. Mollusks and
// parasites are included on purpose (the brief calls them out) — squid and snails
// are common and interesting to flock; parasites tend to fall in the most-reviled
// band rather than being irrelevant. The axis is meant to organize whatever is in
// this list; keep the human thumb off the scale here.
//
// Strings are English common names (the embedded vocabulary IS the cultural lens —
// see PROJECT_BRIEF section 4). Lowercase, one common name per entry.

export const ANIMALS: readonly string[] = [
  // companion & domestic mammals
  'dog', 'cat', 'puppy', 'kitten', 'horse', 'pony', 'donkey', 'rabbit', 'hamster',
  'guinea pig', 'ferret', 'goat', 'sheep', 'lamb', 'cow', 'calf', 'pig', 'piglet',
  'ox', 'llama', 'alpaca', 'mule',

  // charismatic wild mammals
  'lion', 'tiger', 'leopard', 'cheetah', 'jaguar', 'panther', 'lynx', 'cougar',
  'elephant', 'giraffe', 'zebra', 'rhinoceros', 'hippopotamus', 'gorilla',
  'chimpanzee', 'orangutan', 'gibbon', 'lemur', 'panda', 'koala', 'kangaroo',
  'wallaby', 'wombat', 'sloth', 'anteater', 'armadillo', 'meerkat', 'wolf',
  'fox', 'red fox', 'arctic fox', 'coyote', 'jackal', 'dingo', 'bear',
  'polar bear', 'grizzly bear', 'black bear', 'deer', 'fawn', 'elk', 'moose',
  'reindeer', 'antelope', 'gazelle', 'bison', 'buffalo', 'camel', 'yak',
  'boar', 'warthog', 'hedgehog', 'porcupine', 'badger', 'otter', 'beaver',
  'raccoon', 'skunk', 'opossum', 'squirrel', 'chipmunk', 'marmot', 'mongoose',
  'hyena', 'wildebeest', 'tapir', 'okapi', 'platypus', 'echidna',

  // marine mammals
  'dolphin', 'whale', 'blue whale', 'humpback whale', 'orca', 'porpoise',
  'seal', 'sea lion', 'walrus', 'manatee', 'dugong', 'narwhal',

  // rodents & small mammals often disliked
  'mouse', 'rat', 'brown rat', 'sewer rat', 'vole', 'shrew', 'mole', 'gerbil',
  'bat', 'fruit bat', 'vampire bat',

  // birds
  'sparrow', 'robin', 'bluebird', 'cardinal', 'finch', 'canary', 'swallow',
  'wren', 'chickadee', 'blue jay', 'magpie', 'crow', 'raven', 'starling',
  'pigeon', 'dove', 'seagull', 'albatross', 'pelican', 'heron', 'egret',
  'crane', 'stork', 'flamingo', 'swan', 'goose', 'duck', 'duckling', 'mallard',
  'owl', 'eagle', 'bald eagle', 'hawk', 'falcon', 'osprey', 'vulture',
  'condor', 'peacock', 'turkey', 'chicken', 'rooster', 'hen', 'chick',
  'quail', 'pheasant', 'partridge', 'ostrich', 'emu', 'penguin', 'puffin',
  'kingfisher', 'woodpecker', 'hummingbird', 'parrot', 'macaw', 'cockatoo',
  'toucan', 'kiwi', 'nightingale', 'lark', 'cuckoo',

  // reptiles
  'turtle', 'sea turtle', 'tortoise', 'lizard', 'gecko', 'iguana', 'chameleon',
  'komodo dragon', 'skink', 'snake', 'python', 'boa', 'cobra', 'viper',
  'rattlesnake', 'anaconda', 'crocodile', 'alligator', 'gharial',

  // amphibians
  'frog', 'tree frog', 'toad', 'tadpole', 'salamander', 'newt', 'axolotl',

  // fish & aquatic vertebrates
  'goldfish', 'koi', 'clownfish', 'guppy', 'salmon', 'trout', 'tuna', 'cod',
  'mackerel', 'sardine', 'herring', 'anchovy', 'catfish', 'carp', 'bass',
  'perch', 'pike', 'eel', 'seahorse', 'pufferfish', 'anglerfish', 'swordfish',
  'marlin', 'barracuda', 'piranha', 'shark', 'great white shark', 'hammerhead',
  'stingray', 'manta ray', 'lamprey', 'hagfish',

  // insects
  'butterfly', 'monarch butterfly', 'moth', 'bee', 'honeybee', 'bumblebee',
  'wasp', 'hornet', 'ant', 'fire ant', 'termite', 'ladybug', 'firefly',
  'dragonfly', 'damselfly', 'grasshopper', 'cricket', 'locust', 'mantis',
  'beetle', 'dung beetle', 'weevil', 'cockroach', 'fly', 'housefly', 'horsefly',
  'mosquito', 'gnat', 'midge', 'aphid', 'cicada', 'earwig', 'silverfish',
  'caterpillar', 'maggot', 'grub', 'stink bug', 'bedbug',

  // arachnids & myriapods
  'spider', 'tarantula', 'black widow', 'wolf spider', 'scorpion', 'tick',
  'mite', 'harvestman', 'centipede', 'millipede',

  // crustaceans
  'crab', 'hermit crab', 'lobster', 'crayfish', 'shrimp', 'prawn', 'krill',
  'barnacle', 'woodlouse',

  // mollusks (explicitly included)
  'octopus', 'squid', 'cuttlefish', 'nautilus', 'snail', 'garden snail', 'slug',
  'sea slug', 'clam', 'oyster', 'mussel', 'scallop', 'cockle', 'periwinkle',
  'whelk', 'limpet',

  // other invertebrates
  'jellyfish', 'starfish', 'sea urchin', 'sea cucumber', 'sea anemone', 'coral',
  'sponge', 'earthworm', 'nightcrawler', 'leech', 'sandworm', 'ragworm',

  // parasites (may form the most-reviled tier)
  'tapeworm', 'roundworm', 'hookworm', 'pinworm', 'ringworm', 'flatworm',
  'fluke', 'liver fluke', 'flea', 'louse', 'head louse', 'bot fly', 'mite',
  'chigger', 'bedbug', 'guinea worm', 'scabies mite',
];
