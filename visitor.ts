import * as P from "./parser";
import fs = require("fs"); 
import { assert } from "console";

export class Visitor {  
  visit(tree: P.Ast) {
    if (tree instanceof P.AstNode) {
      for (let c of tree.data) {
        this.visit(c);
      }
    }
    this.callUserFunc(tree);
  }
  visitTopDown(tree: P.Ast) {
    this.callUserFunc(tree);
    if (tree instanceof P.AstNode) {
      for (let c of tree.data) {
        this.visit(c);
      }
    }
  }
  protected defaultVisit(tree: P.Ast) {
    // does nothing
  }
  private callUserFunc(tree: P.Ast) {
    if (tree.name in this) {
      this[tree.name](tree);
    } else {
      this.defaultVisit(tree);
    }
  }
}

export class FlattenVisitor extends Visitor {
  lines: string[] = [];
  protected defaultVisit(tree: P.Ast) {
    if (tree instanceof P.AstTerminal) {
      this.lines.push(this.getNodeData(tree));
    }
  }
  getNodeData(node: P.Ast) {
    return node.data[0];
  }
  writeToFile(path: string) {
    fs.writeFileSync(path, this.lines.join('\n') + '\n');
  }
  clear() {
    this.lines = []
  }
}