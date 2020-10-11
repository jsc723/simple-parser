import { assert } from "console";
const fs = require("fs"); 
import { stringify } from "querystring";

enum Sig {
  ERR = -1,
  //EOF = -2
}

export abstract class Ast {
  name: string = "";
  begin?: number;
  data?: any;
  end?: number;
  abstract pretty(level?: number);
}

export class AstTerminal extends Ast {
  data?: RegExpMatchArray;
  constructor(name: string) {
    super();
    this.name = name;
  }
  pretty(level: number = 0) {
    return '  '.repeat(level)
      + `<${this.name}  range=[${this.begin}, ${this.end}]  data="${this.data}"/>`
  }
}

export class AstNode extends Ast {
  data: Ast[] = [];
  constructor(name: string) {
    super();
    this.name = name;
  }
  pretty(level: number = 0) {
    let s = '  '.repeat(level) + `<${this.name}  range=[${this.begin}, ${this.end}]\n`;
    s += this.data.map(a => a.pretty(level + 1)).join(',\n')
    s += '\n' + '  '.repeat(level) + '/>'
    return s;
  }
}

export abstract class Node {
  name: string;
  constructor(dp: any) {
    this.name = dp.name ? dp.name : "";
  }
  parse(input: string[], idx: number, ast: AstNode, errs: string[]): number
  {
    return Sig.ERR;
  }
  error(input:string[], line: number, reason: string): string {
    let msg = `(${this.name}) Error in line ${line}: ${input[line]}: ${reason}`;
    return msg;
  }
}
function make(cstr: {new (dp: any): Node}, dp: any): Node {
  if (dp.optional) {
    return new Optional(dp);
  } else {
    return new cstr(dp);
  }
}
function createNode(dp: any): Node {
  switch (dp.type) {
    case "seq":
      return make(Sequential, dp);
    case "repeat":
      return make(Repeat, dp);
    case "or":
      return make(Or, dp);
    case undefined:
    case null:
    case "terminal":
      return make(Terminal, dp);
  }
  throw new Error('Unsupported type: ' + dp.type);
}

class Terminal extends Node {
  pattern: RegExp;
  constructor(dp: any) {
    super(dp);
    assert(!dp.type || dp.type === "terminal");
    assert(typeof dp.content === 'string');
    if(dp.content[0] !== '^') {
      dp.content =  '^' + dp.content;
    }
    if (dp.content[dp.content.length - 1] !== '$') {
      dp.content += '$';
    }
    this.pattern = new RegExp(dp.content);
  }
  parse(input: string[], idx: number, ast: AstNode, errs: string[]): number {
    if (idx >= input.length) {
      errs.push(this.error(input, idx, "Unexpected EOF"));
      return Sig.ERR;
    }
    let matched = this.pattern.exec(input[idx]);
    if (matched) {
      let c = new AstTerminal(this.name);
      c.data = matched;
      c.begin = idx;
      c.end = idx + 1;
      ast.data.push(c);
      return idx + 1;
    }
    errs.push(this.error(input, idx, "Expression not matches"));
    return Sig.ERR;
  }
}

class Sequential extends Node {
  parsers: Node[];
  constructor(dp: any) {
    super(dp);
    assert(dp.type === "seq");
    this.parsers = [];
    for (let node of dp.content) {
      this.parsers.push(createNode(node));
    }
  }
  parse(input: string[], idx: number, ast: AstNode, errs: string[]): number {
    let i = idx;
    let c = new AstNode(this.name);
    for (let node of this.parsers) {
      i = node.parse(input, i, c, errs);
      if (i == Sig.ERR) {
        errs.push(this.error(input, idx, "error in child"));
        return Sig.ERR;
      }
    }
    c.begin = idx;
    c.end = i;
    ast.data.push(c);
    return i;
  }
}

class Or extends Node {
  parsers: Node[];
  constructor(dp: any) {
    super(dp);
    assert(dp.type === "or");
    this.parsers = [];
    for (let node of dp.content) { 
      this.parsers.push(createNode(node));
    }
  }
  parse(input: string[], idx: number, ast: AstNode, errs: string[]): number {
    let i = idx;
    for (let j = 0; j < this.parsers.length; j++) {
      let node = this.parsers[j];
      i = node.parse(input, idx, ast, [])
      if (i >= 0) {
        return i;
      }
    }
    errs.push(this.error(input, idx, "None of the sub nodes matches"));
    return Sig.ERR;
  }
}

class Repeat extends Node {
  parser: Node;
  constructor(dp: any) {
    super(dp);
    assert(dp.type === "repeat");
    this.parser = createNode(dp.content);
  }
  parse(input: string[], idx: number, ast: AstNode, errs: string[]): number {
    let i = idx;
    let c = new AstNode(this.name);
    while (true) {
      let j = this.parser.parse(input, i, c, []);
      if (j === Sig.ERR || j <= i) {
        c.begin = idx;
        c.end = i;
        ast.data.push(c);
        return i; 
      } else { 
        //j > i
        i = j;
      }
    }
  }
}

// try to match first, skip if not match
class Optional extends Node {
  parser: Node;
  constructor(dp: any) {
    super(dp);
    assert(!!dp.optional);
    dp.optional = false; //remove optional tag
    this.parser = createNode(dp); // forward dp
  }
  parse(input: string[], idx: number, ast: AstNode, errs: string[]): number {
    let j = this.parser.parse(input, idx, ast, []);
    if (j >= 0) {
      return j;
    } else {
      return idx;
    }
  }
}


// try to match first, skip if not match
class Start extends Node {
  parser: Node;
  constructor(dp: any) {
    super(dp);
    this.parser = createNode(dp); // forward dp
  }
  parse(input: string[], idx: number, ast: AstNode, errs: string[]): number {
    let end = this.parser.parse(input, idx, ast, errs);
    ast.begin = 0;
    ast.end = end;
    if (end === input.length) {
      return end;
    }
    if (end > input.length) {
      errs.push(this.error(input, end, "Unexpected parser behavior (shoule be a bug in parser)"));
    } else if (end >= 0) {
      errs.push(this.error(input, end, "Unexpected contents starting at this line"));
    }
    return end;
  }
}

function generateParser(grammerFile: string): Node | undefined {
  let rawData = fs.readFileSync(grammerFile);
  let dp = JSON.parse(rawData);
  if (dp)
    return new Start(dp);
  return undefined;
}
export class LineLangParser {
  private p: Node | undefined;
  constructor(path: string) {
    this.p = generateParser(path);
  }
  parse(filePath: string, allowPartial: boolean = false): Ast {
    try {
      let data = fs.readFileSync(filePath, 'utf8');
      return this.parseStr(data, allowPartial);
    } catch(e) {
        console.log('Error:', e.stack);
    }
  }

  parseStr(input: string, allowPartial: boolean = false): Ast {
    let inputs = input.split('\n');
    let ast = new AstNode('start');
    let errs: string[] = [];
    let end = this.p.parse(inputs, 0, ast, errs);
    
    if (end !== input.length) {
      for(let e of errs) {
        console.log(e);
      }
      return allowPartial ? ast : undefined;
    }
    return ast;
  }

}
