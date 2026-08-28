// 故意带 lint 错误的 8-bit 计数器（反面教材，用于演示 lint 迭代闭环）
// 错误 1：隐式 wire——cnt_en 拼写笔误（设计意图是 en），隐式生成 1-bit wire
// 错误 2：位宽不匹配——q + 1 中 1 是 32-bit 整数字面量，与 8-bit q 相加触发 WIDTH 告警
// 注意：本文件预期被 verilator --lint-only -Wall 判失败，请勿"修复"
module counter (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       en,
    output reg  [7:0] q
);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            q <= 8'd0;
        else if (cnt_en)   // 隐式 wire：应为 en
            q <= q + 1;    // 位宽不匹配：应为 8'd1
    end

endmodule
