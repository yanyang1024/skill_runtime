// 自检 testbench：8-bit 计数器
// 约定：失配打印 MISMATCH，全部通过打印 TEST PASS
// 覆盖：复位、使能计数、使能关断保持、8-bit 回绕（255 -> 0）
`timescale 1ns / 1ps

module tb;

    reg         clk;
    reg         rst_n;
    reg         en;
    wire  [7:0] q;

    integer errors;   // 失配计数
    integer i;        // 循环变量

    // 被测设计
    counter dut (
        .clk   (clk),
        .rst_n (rst_n),
        .en    (en),
        .q     (q)
    );

    // 时钟：10ns 周期
    initial clk = 1'b0;
    always #5 clk = ~clk;

    // 检查任务：实际值 != 期望值则打印 MISMATCH 并计数
    task check;
        input [7:0] expected;
        begin
            if (q !== expected) begin
                $display("MISMATCH: t=%0t expected=%0d actual=%0d", $time, expected, q);
                errors = errors + 1;
            end
        end
    endtask

    initial begin
        errors = 0;
        rst_n  = 1'b0;
        en     = 1'b0;

        // 场景 1：异步复位清零
        #12;
        check(8'd0);
        rst_n = 1'b1;

        // 场景 2：使能计数，连数 10 拍
        en = 1'b1;
        for (i = 1; i <= 10; i = i + 1) begin
            @(posedge clk); #1;
            check(i[7:0]);
        end

        // 场景 3：使能关断，值应保持
        en = 1'b0;
        repeat (4) begin
            @(posedge clk); #1;
            check(8'd10);
        end

        // 场景 4：回绕——再数 246 拍，10 + 246 = 256，应回绕到 0
        en = 1'b1;
        repeat (245) @(posedge clk);
        @(posedge clk); #1;
        check(8'd0);

        // 汇总：有 MISMATCH 则非零退出（哨兵也会命中 MISMATCH）
        if (errors == 0)
            $display("TEST PASS");
        else begin
            $display("TEST FAIL: %0d errors", errors);
            $fatal(1);
        end
        $finish;
    end

endmodule
