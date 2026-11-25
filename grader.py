"""Runs inside the disposable Python container. The web server never runs submissions."""

import ast
import json
import re
import subprocess
import sys


def program(inputs=(), *, numbers=None, patterns=(), probe=None, seed=1):
    return {
        "inputs": inputs, "numbers": numbers, "patterns": patterns,
        "probe": probe, "seed": seed,
    }


def fixed(*numbers, patterns=()):
    return [program(numbers=numbers, patterns=patterns)]


def values(*pairs):
    return [program(args, numbers=result) for args, result in pairs]


def messages(*pairs):
    return [program(args, patterns=patterns) for args, patterns in pairs]


def checks(probe, inputs=(), *, patterns=()):
    return [program(inputs, probe=probe, patterns=patterns)]


TESTS = {
    1: checks("""assert isinstance(ns['name'], str) and ns['name'].strip()
assert type(ns['age']) is int and ns['age'] > 0 and ns['level'] == 1
assert any(ns['name'] in line and numbers(line)[-2:] == [ns['age'], 1]
           for line in printed.splitlines())"""),
    2: fixed(5, 10, 10, 5),
    3: fixed(55, 45),
    4: messages((["Алиса"], [r"асила\b"]), (["Тимур"], [r"румит\b"])),
    5: values(([4, 5], [20]), ([7, 2], [14]), ([1, 9], [9])),
    6: [program(patterns=[rf"class '{kind}'" for kind in ("int", "float", "str", "bool")],
                probe="assert any_call('type')")],
    7: values(([3, 5], [8]), ([-8, 2], [-6]), ([12, 19], [31])),
    8: messages(([8], [r"\btrue\s*$"]), ([7], [r"\bfalse\s*$"]), ([0], [r"\btrue\s*$"])),
    9: values(([100], [212]), ([0], [32]), ([-40], [-40])),
    10: values(([1, 30], [5400]), ([0, 2], [120]), ([2, 0], [7200])),
    11: fixed(4, patterns=[r"\bsword\b", r"\bboots\b"]),
    12: checks("""assert lists_in_output(printed) == [
    ['яблоко', 'банан', 'груша', 'манго'],
    ['яблоко', 'груша', 'манго'],
    ['арбуз', 'груша', 'манго'],
]"""),
    13: fixed(110, 30, 8, 18.3333333333),
    14: checks("""ordered = ['Алиса', 'Вова', 'Соня', 'Тимур']
assert lists_in_output(printed) == [ordered, ordered[::-1]]
assert any_call('sort')"""),
    15: fixed(3, 0, patterns=[r"босс не найден"]),
    16: [program(numbers=[1, 2, 3, 4], patterns=[r"1\D+слайм", r"2\D+скелет", r"3\D+зомби", r"4\D+дракон"], probe="assert any_node(ast.For)")],
    17: [
        program([n], patterns=[rf"\b{n}\s*[xх*×]\s*{i}\s*=\s*{n * i}(?!\d)" for i in range(1, 11)])
        for n in (3, 7, 0)
    ],
    18: fixed(*range(2, 21, 2), 110),
    19: [program(numbers=list(range(10, 0, -1)), patterns=[r"пуск"], probe="assert any_node(ast.While)")],
    20: values(([10, 25, 0], [35]), ([0], [0]), ([2, 7, 11, 0], [20])),
    21: checks(
        "assert reads == len(inputs) and any_node(ast.While)",
        ["wrong", "123", "python123"], patterns=[r"добро пожаловать"],
    ) + messages((["python123"], [r"добро пожаловать"])),
    22: [program(["нет", "да", "нет", "да", "да", "да", "да"], numbers=[4, 3, 2, 1, 0], patterns=[r"игра окончена"], probe="assert reads == len(inputs) and any_node(ast.While)")],
    23: [
        program([3, 9, 7], patterns=[r"больше|мало|низк", r"меньше|много|высок"],
                probe="assert reads == 3 and numbers(printed.splitlines()[-1])[-1] == 3"),
        program([7], probe="assert reads == 1 and numbers(printed.splitlines()[-1])[-1] == 1"),
    ],
    24: [program(numbers=list(range(2, 16, 2)), probe="assert any_node(ast.Continue)")],
    25: checks("assert any_node(ast.Break) and numbers(printed)[-1] in (2, 3)", patterns=[r"дракон.*позици"]),
    26: checks("""assert any_node(ast.Break) and any_node(ast.Continue)
assert 'меч' in printed and 'зелье' in printed and 'щит найден' in printed.lower()
assert not any(word in printed.lower() for word in ('яд', 'лук'))"""),
    27: messages(*[([n], [label]) for n, label in [
        (10, "отлично"), (9, "отлично"), (8, "хорошо"), (7, "хорошо"),
        (6, "нормально"), (5, "нормально"), (4, "надо подтянуть"), (1, "надо подтянуть"),
    ]]),
    28: messages((["admin", "1234"], ["добро пожаловать"]),
                 (["admin", "4321"], ["неверный логин или пароль"]),
                 (["user", "1234"], ["неверный логин или пароль"])),
    29: [program(args, numbers=[best], probe="assert not any_call('max') and any_node(ast.If)")
         for args, best in [([5, 12, 8], 12), ([8, 3, 5], 8), ([-5, -3, -2], -2), ([7, 7, 1], 7)]],
    30: messages(([0, "да"], ["игра окончена"]), ([71, "да"], ["непобедим"]),
                 ([100, "нет"], ["сил[её]н, но уязвим"]), ([70, "да"], ["осторожно"])),
    31: messages((["abc45678"], [r"(?<!не)над[её]жный"]), (["123"], [r"коротк|длин|символ|минимум|букв"]),
                 (["abcdefgh"], [r"цифр"]), (["abc"], ["очень слабый"])),
    32: checks("""for name in ('Лина', 'Тимур'):
    assert f'Привет, {name}!' in capture(ns['greet'], name)
assert len(set(re.findall(r'привет,? ([^!\\n]+)', printed, re.I))) >= 3"""),
    33: checks("""for n in (4, 7, -3, 0, 2.5):
    assert ns['square'](n) == n ** 2"""),
    34: checks("""assert ns['add'](3, 5) == 8 and ns['add'](-3, 1) == -2
assert 8 in numbers(printed)"""),
    35: checks("""fn = ns['add_print']
returned = []
assert numbers(capture(lambda: returned.append(fn(7, -2)))) == [5] and returned == [None]
assert ns['add_return'](7, -2) == 5
assert numbers(printed) == [8, 8] and 'None' in printed"""),
    36: checks("""fn = ns['multiply']
assert (fn(5), fn(3, 4), fn(7, 0), fn(-2, 3)) == (10, 12, 0, -6)"""),
    37: checks("""fn = ns['health_status']
assert 'живой' in fn(71).lower()
assert 'опасность' in fn(70).lower() and 'опасность' in fn(1).lower()
assert re.search('м[её]ртв', fn(0).lower())"""),
    38: checks("""fn = ns['to_fahrenheit']
assert all(abs(fn(c) - f) < .0001 for c, f in [(0, 32), (100, 212), (-40, -40), (25, 77)])"""),
    39: checks("""fn = ns['take_damage']
assert (fn(100, 20), fn(100, 20, True), fn(10, 50), fn(10, 50, True)) == (80, 90, 0, 0)"""),
    40: checks("""fn = ns['player_info']
assert callable(ns['health_status'])
ns['health_status'] = lambda hp: 'Проверка статуса'
out = capture(fn, 'Дана', 65, 3)
assert 'Дана' in out and numbers(out) == [3, 65] and 'Проверка статуса' in out"""),
    41: checks("""hero, enemy = {'name': 'Лина', 'attack': 9}, {'name': 'Босс', 'hp': 40}
for crit, damage in [(False, 9), (True, 18)]:
    out = ns['battle'](hero, enemy, crit) if crit else ns['battle'](hero, enemy)
    assert 'Лина' in out and 'Босс' in out and numbers(out) == [damage]"""),
    42: checks("""enemies = [['Лис', 20], ['Кот', 40], ['Волк', 30]]
out = capture(ns['show_enemies'], enemies)
assert all(name in out for name, hp in enemies) and numbers(out) == [1, 20, 2, 40, 3, 30]
assert ns['total_hp'](enemies) == 90 and ns['find_boss'](enemies) == 'Кот'
assert ns['remove_weak'](enemies, 30) == enemies[1:] and len(enemies) == 3"""),
    43: checks("""hero = ns['hero']
assert hero['class'] == 'маг' and {'name', 'hp', 'level'} <= hero.keys()
assert hero['name'] in printed.split('{', 1)[0] and hero in dicts_in_output(printed)
assert any(isinstance(node, ast.AugAssign) and isinstance(node.op, ast.Sub)
           or isinstance(node, ast.BinOp) and isinstance(node.op, ast.Sub)
           for node in ast.walk(tree))"""),
    44: values((["зелье"], [10]), (["лук"], [40]), (["щит"], [20])) +
        messages((["сапоги"], ["такого товара нет"])),
    45: fixed(8, 5, 10, 3, 26, patterns=[r"сила", r"ловкость", r"ум", r"удача"]),
    46: checks("""assert reads == len(inputs) and any_node(ast.While)
assert any(isinstance(v, dict) and len(v) == 5 and
           all(isinstance(k, str) and isinstance(t, str) for k, t in v.items())
           for v in ns.values())""", ["unlisted_001", "stop"], patterns=[r"не знаю такого слова"]),
    47: [program([word], probe=f"""expected = {expected!r}
assert expected in dicts_in_output(printed) or all(
    re.search(r'(?<!\\w)' + k + r'[^\\w\\n]*' + str(v) + r'(?!\\d)', printed, re.I)
    for k, v in expected.items())""") for word, expected in [
        ("молоко", {"м": 1, "о": 3, "л": 1, "к": 1}),
        ("ананас", {"а": 3, "н": 2, "с": 1}),
    ]],
    48: checks("""expected = [
    {'зелье': 2, 'стрела': 15, 'факел': 1}, {'зелье': 1, 'стрела': 15, 'факел': 1},
    {'зелье': 1, 'стрела': 15},
]
assert dicts_in_output(printed)[-3:] == expected""", patterns=["нет такого предмета"]),
    49: checks("""expected = {'кот': 3, 'пёс': 3, 'хомяк': 1}
assert expected in dicts_in_output(printed) or all(
    re.search(k + r'[^\\w\\n]*' + str(v), printed, re.I) for k, v in expected.items())
assert re.search(r'ничья[^\\n]*(кот[^\\n]*п[её]с|п[её]с[^\\n]*кот)', printed, re.I)"""),
    50: checks("""lines = printed.lower().splitlines()
assert any('кот' in line and 'ток' in line for line in lines)
assert any(re.search(r'\\bрот\\b', line) and re.search(r'\\bтор\\b', line) for line in lines)
assert all(not re.search(r'\\b(торт|окно|кино)\\b', line) for line in lines)"""),
    51: checks("""prices = [3, 8, 12, 5, 7, 10]
out = numbers(re.split(r'[=(]', printed, maxsplit=1)[0])
assert any(i.is_integer() and j.is_integer() and 0 <= i < 6 and 0 <= j < 6
           and i != j and prices[int(i)] + prices[int(j)] == 15
           for i, j in zip(out, out[1:]))
assert any_node(ast.Dict, ast.DictComp) or any_call('dict')"""),
    101: [program(seed=seed, probe="""assert re.search(r'\\b(ор[её]л|решка)\\b', printed, re.I)
assert events and (choice_result_matches() or any(name in ('randint', 'randrange', 'random', 'getrandbits') for name, args, value in events))""")
          for seed in (1, 5)],
    102: [program(seed=seed, probe="""pins = numbers(printed)
assert len(pins) == 1 and 1000 <= pins[0] <= 9999
assert any(name in ('randint', 'randrange', 'choice', 'choices', 'sample', 'random', 'getrandbits')
           for name, args, value in events)""") for seed in (1, 7)],
    103: checks("""assert reads == 1
assert any(name == 'choice' and len(args[0]) == 5 and str(value) in printed
           for name, args, value in events)""", ["Будет ли дождь?"]),
    104: [program([option], seed=4, probe="""choice = next(value for name, args, value in events if name == 'choice')
option = inputs[0]
wins = {'камень': 'ножницы', 'ножницы': 'бумага', 'бумага': 'камень'}
if choice.lower() == option:
    assert 'ничь' in printed.lower()
elif wins[option] == choice.lower():
    assert re.search(r'игрок|ты |вы |победа', printed, re.I)
else:
    assert re.search(r'компьютер|проигр', printed, re.I)""") for option in ("камень", "ножницы", "бумага")],
    105: checks("""temps = [value for name, args, value in events if name == 'uniform']
assert len(temps) == 5 and all(-10 <= x <= 35 for x in temps)
assert any(name == 'uniform' and args == (-10, 35) for name, args, value in events)
assert any_call('round') and numbers(printed)[-1] == round(max(temps), 1)"""),
    106: checks("""assert len([line for line in printed.splitlines() if line.strip()]) == 5
assert len([event for event in events if event[0] == 'choice']) >= 10
assert all(len(line.split()) >= 2 for line in printed.strip().splitlines())"""),
    107: checks("""assert reads == 5 and any(name == 'shuffle' and len(value) == 5 for name, args, value in events)
out = numbers(printed)
assert out and 0 <= out[-1] <= 5""", ["--"] * 5),
    108: [program([level, 1, 1, 1, 1, 1], seed=4, probe=f"""assert reads == 6
assert any(name == 'randint' and args == (1, {limit}) or
           name == 'randrange' and args == (1, {limit + 1})
           for name, args, value in events)""")
          for level, limit in [(1, 10), (2, 50), (3, 100)]],
    109: checks("""a, b = ns['Rectangle'](3, 7), ns['Rectangle'](2, 5)
assert (a.area(), a.perimeter(), b.area(), b.perimeter()) == (21, 20, 10, 14)
assert len(numbers(printed)) >= 2"""),
    110: checks("""book = ns['Book']('История', 'Ася', 200)
assert numbers(capture(book.progress))[-1] == 0
book.read(50)
assert numbers(capture(book.progress))[-1] == 25
book.read(150)
book.read(50)
assert numbers(capture(book.progress))[-1] == 100"""),
    111: checks("""account = ns['Account']('Ася')
assert numbers(capture(account.show))[-1] == 0
account.deposit(70)
account.withdraw(20)
assert 'недостаточно средств' in capture(account.withdraw, 80).lower()
assert numbers(capture(account.show))[-1] == 50"""),
    112: checks("""light = ns['TrafficLight']()
colors = ['красный', 'зелёный', 'жёлтый', 'красный', 'зелёный', 'жёлтый']
for color in colors:
    assert color.replace('ё', 'е') in capture(light.show).lower().replace('ё', 'е')
    light.next()
assert len(re.findall('красный|зел[её]ный|ж[её]лтый', printed, re.I)) >= 5"""),
    113: checks("""cart = ns['Cart']()
assert cart.total() == 0
cart.add(ns['Product']('Чай', 5))
cart.add(ns['Product']('Хлеб', 7))
assert cart.total() == 12
out = capture(cart.show)
assert 'Чай' in out and 'Хлеб' in out and 12 in numbers(out) and printed.strip()"""),
    114: checks("""pet = ns['Pet']('Лис')
assert pet.hunger == 5
mood = pet.mood
pet.play()
assert pet.hunger > 5 and (mood == 10 or pet.mood > mood)
hunger = pet.hunger
pet.feed()
assert pet.hunger < hunger
for hunger, mood, result in [(5, 5, True), (6, 9, False), (2, 4, False)]:
    pet.hunger, pet.mood = hunger, mood
    assert pet.is_happy() is result
assert reads == len(inputs)""", [1, 2, 3, 0]),
    115: checks("""a, b = ns['Hero']('Ал', 55), ns['Hero']('Бо', 20)
assert a.is_alive() and b.is_alive()
a.attack(b)
assert b.is_alive()
a.attack(b)
assert not b.is_alive() and any_node(ast.While) and printed.strip()"""),
    116: checks("""robot = ns['Robot']('Бот')
assert (robot.x, robot.y) == (0, 0)
robot.forward(7)
robot.back(2)
robot.left(4)
robot.right(1)
assert (robot.x, robot.y) == (-3, 5)
assert numbers(capture(robot.position))[-2:] == [-3, 5] and printed.strip()"""),
}


# Each case gets fresh Python globals, input, and random state.
CASE_RUNNER = r'''
import ast
import builtins
import contextlib
import io
import json
import random
import re
import sys

request = json.load(sys.stdin)
code, case = request["code"], request["case"]
inputs = [str(value) for value in case["inputs"]]
source = io.StringIO("".join(value + "\n" for value in inputs))
reads = 0

def read_input(prompt=""):
    global reads
    line = source.readline()
    if not line:
        raise EOFError
    reads += 1
    return line.rstrip("\n")

def numbers(text):
    return [float(number.replace(",", ".")) for number in
            re.findall(r"[-+]?\d+(?:[.,]\d+)?", text)]

def literals(text, pattern):
    out = []
    for match in re.findall(pattern, text):
        try:
            out.append(ast.literal_eval(match))
        except (SyntaxError, ValueError):
            continue
    return out

class OutputLimit(Exception):
    pass

class Output(io.StringIO):
    def write(self, text):
        if self.tell() + len(text) > 16000:
            raise OutputLimit
        return super().write(text)

def capture(fn, *args):
    with contextlib.redirect_stdout(Output()) as out:
        fn(*args)
    return out.getvalue()

random.seed(case["seed"])
events = []

def trace(name, original):
    def traced(*args, **kwargs):
        value = original(*args, **kwargs)
        events.append((name, args, list(args[0]) if name == "shuffle" else value))
        return value
    return traced

for name in ("choice", "choices", "randint", "randrange", "uniform", "shuffle", "sample", "random", "getrandbits"):
    setattr(random, name, trace(name, getattr(random, name)))

ns = {"__name__": "__main__"}
sys.stdin = source
builtins.input = read_input
try:
    tree = ast.parse(code)
    printed = capture(exec, compile(tree, "<solution>", "exec"), ns)
except OutputLimit:
    result = "output"
except BaseException as error:
    result = "input" if isinstance(error, EOFError) else "runtime"
else:
    expected = case["numbers"]
    actual = numbers(printed)
    result = "wrong"
    try:
        assert expected is None or (len(actual) == len(expected) and
            all(abs(a - b) <= 0.005 for a, b in zip(actual, expected)))
        assert all(re.search(pattern, printed, re.I) for pattern in case["patterns"])
        if case["probe"]:
            def any_node(*types):
                return any(isinstance(node, types) for node in ast.walk(tree))
            def any_call(name):
                return any(
                    isinstance(node, ast.Call) and (
                        isinstance(node.func, ast.Name) and node.func.id == name
                        or isinstance(node.func, ast.Attribute) and node.func.attr == name
                    ) for node in ast.walk(tree)
                )
            capture(exec, case["probe"], dict(
                ns=ns, printed=printed, numbers=numbers, inputs=inputs, reads=reads,
                any_node=any_node, any_call=any_call, capture=capture,
                lists_in_output=lambda s: literals(s, r"\[[^\[\]\n]*\]"),
                dicts_in_output=lambda s: literals(s, r"\{[^{}\n]*\}"),
                choice_result_matches=lambda: any(
                    name == "choice" and isinstance(value, str) and value.lower() in printed.lower()
                    for name, args, value in events
                ),
                events=events, re=re, ast=ast, tree=tree,
            ))
        result = "passed"
    except Exception:
        pass
print(json.dumps(result))
'''


def grade(task, code):
    cases = TESTS[task]
    try:
        ast.parse(code)
    except SyntaxError as error:
        return {"status": "syntax", "line": error.lineno, "passed": 0, "total": len(cases)}

    passed = 0
    for index, case in enumerate(cases, 1):
        try:
            process = subprocess.run(
                [sys.executable, "-I", "-B", "-c", CASE_RUNNER],
                input=json.dumps({"code": code, "case": case}), encoding="utf-8",
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=1.5,
            )
            status = json.loads(process.stdout) if process.returncode == 0 else "runtime"
            if status not in ("passed", "runtime", "input", "wrong", "output"):
                status = "runtime"
        except subprocess.TimeoutExpired:
            status = "timeout"
        except (ValueError, TypeError):
            status = "runtime"
        if status != "passed":
            return {"status": status, "case": index, "passed": passed, "total": len(cases), "inputs": case["inputs"]}
        passed += 1
    return {"status": "passed", "passed": passed, "total": len(cases)}


if __name__ == "__main__":
    request = json.load(sys.stdin)
    print(json.dumps(grade(request["task"], request["code"])))
