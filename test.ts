import { clear } from "console";
import * as P from "./parser";
import { FlattenVisitor, Visitor } from './visitor';
class TextVisitor extends Visitor {
  currentId: string;
  id(node: P.AstTerminal) {
    this.currentId = node.data[1]
  }
  jtxt(node: P.AstTerminal) {
    node.data[0] = '[' + this.currentId + ']' + node.data[1];
  }
  ctxt(node: P.AstTerminal) {
    node.data[0] = ';[' + this.currentId + ']' + node.data[0];
  }
  block(node: P.AstNode) {
    node.data = node.data.filter(
      d => ['n', 'nt', 'texts', 'whitespace'].indexOf(d.name) !== -1
    );
  }
}
function main() {
  let p = new P.LineLangParser('grammer.json');
  let dp = p.parse('data/min.txt', true);
  console.log(dp.pretty());
  new TextVisitor().visit(dp);
  let flt = new FlattenVisitor()
  flt.visit(dp)
  flt.writeToFile('data/out.txt');
}
main();